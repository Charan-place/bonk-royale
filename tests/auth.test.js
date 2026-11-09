import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyGoogleToken, maskEmail } from '../src/auth.js';

const CLIENT = 'test-client.apps.googleusercontent.com';
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const enc = (o) => b64u(JSON.stringify(o));

const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const other = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const keys = new Map([['k1', pair.publicKey]]);
const NOW = 1_800_000_000_000;

async function sign(claims, { kid = 'k1', alg = 'RS256', key = pair.privateKey } = {}) {
  const head = enc({ alg, kid, typ: 'JWT' });
  const body = enc(claims);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(head + '.' + body));
  return `${head}.${body}.${b64u(sig)}`;
}
const good = { iss: 'https://accounts.google.com', aud: CLIENT, sub: '1234567890123', email: 'kid@example.com', email_verified: true, iat: NOW / 1000 - 10, exp: NOW / 1000 + 3000 };
const check = (t, c = CLIENT) => verifyGoogleToken(t, c, { keys, now: NOW });

test('accepts a valid token', async () => {
  assert.deepEqual(await check(await sign(good)), { sub: good.sub, email: good.email });
});
test('rejects wrong audience, issuer, expired, unverified email', async () => {
  assert.equal(await check(await sign({ ...good, aud: 'other' })), null);
  assert.equal(await check(await sign({ ...good, iss: 'https://evil.example' })), null);
  assert.equal(await check(await sign({ ...good, exp: NOW / 1000 - 600 })), null);
  assert.equal(await check(await sign({ ...good, email_verified: false })), null);
  assert.equal(await check(await sign({ ...good, sub: 'abc' })), null);
});
test('rejects bad signature, unknown kid, wrong alg, junk, no client id', async () => {
  assert.equal(await check(await sign(good, { key: other.privateKey })), null);
  assert.equal(await check(await sign(good, { kid: 'zzz' })), null);
  assert.equal(await check(await sign(good, { alg: 'none' })), null);
  assert.equal(await check('a.b.c'), null);
  assert.equal(await check('x'), null);
  assert.equal(await check(await sign(good), ''), null);
  const t = await sign(good);
  const [h, , s] = t.split('.');
  assert.equal(await check(`${h}.${enc({ ...good, sub: '999999999999' })}.${s}`), null); // tampered payload
});
test('maskEmail hides the address', () => {
  assert.equal(maskEmail('jane.doe@gmail.com'), 'j***@gmail.com');
  assert.equal(maskEmail('nope'), '');
});
