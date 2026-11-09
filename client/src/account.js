// Account box: optional Google sign-in that saves progress to the server account.
// Guests keep playing as before. Under-13s are never shown the Google button.
import { api } from './net.js';

const AGE_KEY = 'bonk_age';
const GSI_SRC = 'https://accounts.google.com/gsi/client';

let clientIdPromise = null;
let gsiPromise = null;

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const btn = (label, cls, fn) => {
  const b = el('button', 'btn small ' + cls, label);
  b.type = 'button';
  b.addEventListener('click', fn);
  return b;
};

const readAge = () => {
  try {
    return localStorage.getItem(AGE_KEY);
  } catch {
    return null;
  }
};
const writeAge = (v) => {
  try {
    localStorage.setItem(AGE_KEY, v);
  } catch {
    /* best effort */
  }
};

export function googleClientId() {
  clientIdPromise ||= api.req('/api/config').then((c) => c.googleClientId || '').catch(() => '');
  return clientIdPromise;
}

function loadGsi() {
  gsiPromise ||= new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const s = document.createElement('script');
    s.src = GSI_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not reach Google'));
    document.head.append(s);
  });
  return gsiPromise;
}

/** Keeps the progress sheet's account box up to date. `ctx`: { store, toast, sfx }. */
export function mountAccountBox(box, ctx) {
  const { store, toast } = ctx;
  let credential = null;

  async function sendCredential(resolve) {
    try {
      const r = await api.req('/api/auth/google', { credential, resolve }, { timeout: 12000 });
      if (r.status === 'conflict') return renderConflict(r);
      if (r.status === 'switched') {
        api.token = r.token;
        try {
          localStorage.setItem('bonk_token', r.token);
        } catch {
          /* tab-only session */
        }
        toast('Welcome back! Loading your saved game…');
        return setTimeout(() => location.reload(), 700);
      }
      store.adopt(r.profile);
      toast('Saved! Your progress is safe now \u{1F389}');
      render();
    } catch (e) {
      toast(e.message || 'Google sign-in failed');
      render();
    }
  }

  function renderConflict(r) {
    const card = (title, s, label, cls, fn) => {
      const c = el('div', 'acct-choice');
      c.append(el('b', '', title), el('span', '', `${s.xp} XP · ${s.coins} coins · ${s.matches} matches · ${s.wins} wins`), btn(label, cls, fn));
      return c;
    };
    box.replaceChildren(
      el('p', 'acct-line', 'You have progress here and in your saved game. Which one do you want?'),
      card('Saved game', r.account, 'Use saved game', '', () => sendCredential('account')),
      card('This device', r.device, 'Keep this device', 'alt', () => {
        if (confirm('This replaces the progress in your saved Google account. Continue?')) sendCredential('device');
      })
    );
  }

  async function showGoogleButton(holder) {
    const id = await googleClientId();
    if (!id) return holder.replaceChildren(el('p', 'acct-line', 'Google sign-in is coming soon. Your progress is saved on this device.'));
    try {
      await loadGsi();
    } catch {
      return holder.replaceChildren(el('p', 'acct-line', "Couldn't reach Google. Check your connection and try again."));
    }
    window.google.accounts.id.initialize({
      client_id: id,
      callback: (resp) => {
        credential = resp.credential;
        sendCredential();
      },
      ux_mode: 'popup',
      auto_select: false,
    });
    const slot = el('div', 'gsi-slot');
    holder.replaceChildren(slot);
    window.google.accounts.id.renderButton(slot, { theme: 'filled_blue', size: 'large', text: 'continue_with', shape: 'pill', width: 260 });
  }

  function render() {
    const d = store.data;
    if (!api.remote) return box.replaceChildren(el('p', 'acct-line', 'Offline practice: progress stays on this device.'));
    if (d.linked) {
      const out = btn('Sign out', 'alt', async () => {
        try {
          await api.req('/api/auth/signout', {});
        } catch {
          /* token is dropped locally either way */
        }
        try {
          localStorage.removeItem('bonk_token');
        } catch {
          /* ignore */
        }
        location.reload();
      });
      const dl = btn('Download my data', 'alt', async () => {
        const data = await api.req('/api/account/export').catch(() => null);
        if (!data) return toast("Couldn't get your data. Try again.");
        const a = el('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        a.download = 'bonk-my-data.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      });
      const del = btn('Delete account', 'alt danger', async () => {
        if (!confirm('Delete your account and all progress forever? This cannot be undone.')) return;
        try {
          await api.req('/api/account/delete', { confirm: 'DELETE' });
          localStorage.removeItem('bonk_token');
          localStorage.removeItem('bonk_profile_v1');
        } catch {
          return toast("Couldn't delete right now. Try again.");
        }
        location.reload();
      });
      const row = el('div', 'acct-row');
      row.append(out, dl, del);
      return box.replaceChildren(el('p', 'acct-line ok', `✅ Saved to your Google account${d.emailHint ? ' (' + d.emailHint + ')' : ''}. Play on any device!`), row);
    }
    const age = readAge();
    if (age === 'u13') return box.replaceChildren(el('p', 'acct-line', 'Ask a grown-up to help you save your progress. You can keep playing as a guest!'));
    if (age !== 'ok') {
      const row = el('div', 'acct-row');
      row.append(
        btn("I'm 13 or older", '', () => {
          writeAge('ok');
          render();
        }),
        btn("I'm under 13", 'alt', () => {
          writeAge('u13');
          render();
        })
      );
      return box.replaceChildren(el('p', 'acct-line', 'Save your progress and play anywhere! First, how old are you?'), row);
    }
    const holder = el('div', 'acct-google');
    box.replaceChildren(el('p', 'acct-line', 'Progress is saved on this device. Sign in to keep it safe and play anywhere!'), holder);
    showGoogleButton(holder);
  }

  render();
  return render;
}
