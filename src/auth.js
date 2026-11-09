// Google sign-in: verifies a Google ID token (RS256 JWT) with WebCrypto against Google's public keys.
// The OAuth client id is public config; no client secret is involved in this flow.
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const KEYS_TTL_MS = 3600_000;

let keyCache = { at: 0, keys: new Map() };

const b64urlToBytes = (s) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const parsePart = (s) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

async function loadKeys(fetchImpl, force) {
  if (!force && Date.now() - keyCache.at < KEYS_TTL_MS && keyCache.keys.size) return keyCache.keys;
  const res = await fetchImpl(JWKS_URL);
  if (!res.ok) throw new Error('could not load Google keys');
  const { keys } = await res.json();
  const map = new Map();
  for (const jwk of keys) {
    if (jwk.kty !== 'RSA' || jwk.alg !== 'RS256') continue;
    map.set(jwk.kid, await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']));
  }
  keyCache = { at: Date.now(), keys: map };
  return map;
}

/**
 * Returns { sub, email } for a valid Google ID token, or null.
 * `opts.keys` (a Map of kid -> CryptoKey) and `opts.now` exist for tests.
 */
export async function verifyGoogleToken(token, clientId, opts = {}) {
  if (!clientId || typeof token !== 'string' || token.length > 4096) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = parsePart(parts[0]);
    const claims = parsePart(parts[1]);
    if (header.alg !== 'RS256' || !header.kid) return null;
    let keys = opts.keys || (await loadKeys(opts.fetch || fetch, false));
    let key = keys.get(header.kid);
    if (!key && !opts.keys) key = (await loadKeys(opts.fetch || fetch, true)).get(header.kid); // key rotation
    if (!key) return null;
    const data = new TextEncoder().encode(parts[0] + '.' + parts[1]);
    const good = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), data);
    if (!good) return null;
    const now = Math.floor((opts.now ?? Date.now()) / 1000);
    if (!ISSUERS.includes(claims.iss)) return null;
    if (claims.aud !== clientId) return null;
    if (typeof claims.exp !== 'number' || claims.exp < now - 30) return null;
    if (typeof claims.iat === 'number' && claims.iat > now + 300) return null;
    if (typeof claims.sub !== 'string' || !/^\d{5,32}$/.test(claims.sub)) return null;
    if (claims.email && claims.email_verified === false) return null;
    return { sub: claims.sub, email: typeof claims.email === 'string' ? claims.email.slice(0, 120) : '' };
  } catch {
    return null;
  }
}

/** "jane.doe@gmail.com" -> "j***@gmail.com" (shown to the owner only). */
export function maskEmail(email) {
  const at = email.indexOf('@');
  return at > 0 ? email[0] + '***' + email.slice(at) : '';
}
