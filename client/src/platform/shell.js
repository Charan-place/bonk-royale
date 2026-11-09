// Page chrome shared by every solo Bonk game: top bar, toasts, instructions, results with rewards,
// leaderboard and a "next game" card. Games only draw their own canvas inside `shell.play`.
import '@fontsource/baloo-2/700.css';
import '@fontsource/lilita-one/400.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import '../ui.css';
import './platform.css';
import { api, store, bootAccount, finishRun } from './run.js';
import { levelOf, displayName } from '../../../shared/cosmetics.js';
import { creatureIcon } from './creature.js';
import { ICON, stars as starsSvg } from './icons.js';
import { CATALOG, byId } from './catalog.js';
import { sfx, audioPrefs } from '../audio.js';
import './pwa.js';
import { initAds } from '../ads.js';

const h = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const button = (label, cls, fn) => {
  const b = h('button', 'btn ' + cls, label);
  b.type = 'button';
  b.addEventListener('click', () => {
    sfx.click();
    fn();
  });
  return b;
};

export async function createShell({ game, help }) {
  const info = byId(game);
  try {
    localStorage.setItem('bonk_last_game', game);
  } catch {
    /* ignore */
  }
  const app = document.getElementById('app');
  document.body.classList.add('bp');
  document.body.dataset.game = game;
  app.innerHTML = `
    <div id="shell">
      <aside class="rail" aria-label="Advertisement"><div class="ad" data-slot="rail"><span>Advertisement</span></div></aside>
      <main id="stage" class="gstage">
        <header class="gbar">
          <a class="hud-btn" href="/games/" aria-label="All games">${ICON.home}</a>
          <b class="gtitle"></b>
          <span class="gchips"><span class="chip" id="gLvl"></span><span class="chip" id="gCoins"></span></span>
          <button class="hud-btn" id="gBoard" type="button" aria-label="Leaderboard">${ICON.trophy}</button>
          <button class="hud-btn" id="gHelp" type="button" aria-label="How to play">${ICON.help}</button>
          <button class="hud-btn" id="gSound" type="button" aria-label="Sound"></button>
        </header>
        <div class="gplay" id="gplay"></div>
        <div id="toasts"></div>
        <div id="gOverlay"></div>
      </main>
    </div>
    <div class="ad banner" data-slot="banner"><span>Advertisement</span></div>`;
  const gt = app.querySelector('.gtitle');
  gt.append(h('i'), document.createTextNode(info.title));
  const play = document.getElementById('gplay');
  const overlay = document.getElementById('gOverlay');

  const refreshChips = () => {
    const d = store.data;
    document.getElementById('gLvl').textContent = `Lv ${levelOf(d.xp)}`;
    document.getElementById('gCoins').replaceChildren(h('span', 'coin-dot'), document.createTextNode(String(d.coins)));
  };
  store.onChange(refreshChips);
  refreshChips();

  const setSoundIcon = () => (document.getElementById('gSound').innerHTML = audioPrefs.get().sfx ? ICON.soundOn : ICON.soundOff);
  setSoundIcon();
  document.getElementById('gSound').addEventListener('click', () => {
    audioPrefs.setSfx(!audioPrefs.get().sfx);
    setSoundIcon();
  });
  window.addEventListener('pointerdown', () => sfx.unlock(), { once: true });

  function toast(text, ms = 2400) {
    const t = h('div', 'toast');
    t.append(h('span', '', text));
    document.getElementById('toasts').append(t);
    setTimeout(() => t.remove(), ms);
  }

  function show(card) {
    overlay.replaceChildren();
    const o = h('section', 'screen overlay');
    o.append(card);
    overlay.append(o);
    return o;
  }
  const hide = () => overlay.replaceChildren();

  // ---- instructions (first visit, and the ? button)
  const seenKey = `bonk_help_${game}`;
  function showHelp() {
    return new Promise((resolve) => {
      const card = h('div', 'card');
      card.append(h('h2', 'gh2', info.title), h('p', 'sub', help.text));
      const keys = h('div', 'helprow');
      for (const [icon, label] of help.controls) {
        const k = h('div', 'helpkey');
        const ic = h('span', 'hk-i');
        ic.innerHTML = ICON[icon] || '';
        k.append(ic, h('span', '', label));
        keys.append(k);
      }
      card.append(keys, button('Got it, let’s play!', 'play small', () => {
        try {
          localStorage.setItem(seenKey, '1');
        } catch {
          /* ignore */
        }
        hide();
        resolve();
      }));
      show(card);
    });
  }
  document.getElementById('gHelp').addEventListener('click', () => showHelp());
  let seen = false;
  try {
    seen = localStorage.getItem(seenKey) === '1';
  } catch {
    /* ignore */
  }

  // ---- leaderboard
  async function showBoard(period = 'today') {
    const card = h('div', 'card');
    card.append(h('h2', 'gh2', 'Top players'));
    const tabs = h('div', 'modes');
    for (const [p, label] of [['today', 'Today'], ['all', 'All time']]) {
      const b = button(label, 'mode' + (p === period ? ' on' : ''), () => showBoard(p));
      tabs.append(b);
    }
    const list = h('ol', 'board');
    card.append(tabs, list);
    card.append(button('Close', 'alt small', hide));
    show(card);
    if (!api.remote) return list.append(h('li', 'empty', 'Leaderboards need an internet connection.'));
    list.append(h('li', 'empty', 'Loading…'));
    try {
      const r = await api.req(`/api/leaderboard?game=${game}&period=${period}`);
      list.replaceChildren();
      if (!r.top.length) list.append(h('li', 'empty', 'No scores yet. Be the first!'));
      r.top.forEach((row, i) => {
        const li = h('li', row.me ? 'me' : '');
        const av = h('img', 'av');
        av.src = creatureIcon(row, 32);
        av.alt = '';
        li.append(h('span', 'rk', String(i + 1)), av, h('span', 'nm', displayName(row)), h('b', 'sc', row.score.toLocaleString()));
        list.append(li);
      });
      if (r.mine.rank > 20) list.append(h('li', 'me', `You: #${r.mine.rank} · ${r.mine.score.toLocaleString()}`));
    } catch {
      list.replaceChildren(h('li', 'empty', 'Could not load the leaderboard.'));
    }
  }
  document.getElementById('gBoard').addEventListener('click', () => showBoard());

  // ---- results
  /** Shows the end-of-run card, reports the score and reveals rewards. */
  async function finish({ score, ms, extra, title, big, starCount = null, lines = [], againLabel = 'Play again', onAgain, extraButtons = [], report = true }) {
    const card = h('div', 'card result');
    card.append(h('h2', 'gh2', title));
    if (starCount != null) {
      const st = h('div', 'stars');
      st.innerHTML = starsSvg(starCount);
      card.append(st);
    }
    if (big) {
      const b = h('p', 'res-score', big[0]);
      b.append(h('small', '', big[1]));
      card.append(b);
    }
    for (const l of lines) card.append(h('p', 'sub big', l));
    const rewardBox = h('div', 'rewardbox', report ? 'Saving…' : '');
    card.append(rewardBox);
    const acts = h('div', 'acts-col');
    acts.append(button(againLabel, 'play small', () => {
      hide();
      onAgain && onAgain();
    }));
    for (const [label, fn] of extraButtons) acts.append(button(label, 'alt small', fn));
    const others = CATALOG.filter((g) => g.id !== game && g.id !== 'royale');
    const next = others[Math.floor(Math.random() * others.length)];
    const nextA = h('a', 'nextgame');
    nextA.href = next.path;
    nextA.style.setProperty('--c', next.color);
    nextA.append(h('span', 'ng-t', `Next up: ${next.title}`), h('small', '', next.blurb));
    card.append(acts, nextA, button('Leaderboard', 'alt small', () => showBoard()));
    show(card);
    sfx.win();
    if (!report) return null;
    const r = await finishRun(game, score, ms, extra);
    rewardBox.replaceChildren();
    if (!r || r.error) rewardBox.append(h('span', 'rw-note', r && r.error ? r.error : 'Score not saved.'));
    else if (r.already) rewardBox.append(h('span', 'rw-note', 'Already counted today. Come back tomorrow!'));
    else {
      const rw = r.reward;
      rewardBox.append(h('span', 'rw', `+${rw.xp} XP`), h('span', 'rw', `+${rw.coins} coins`));
      if (r.newBest) rewardBox.append(h('span', 'rw best', 'New best!'));
      if (rw.levelAfter > rw.levelBefore) {
        rewardBox.append(h('div', 'rw lvl', `Level ${rw.levelAfter}! +${rw.levelCapsules} capsule`));
        sfx.level && sfx.level();
      }
    }
    if (api.remote && !store.data.linked) {
      const a = h('a', 'savelink', 'Save your progress →');
      a.href = '/?save=1';
      rewardBox.append(a);
    }
    return r;
  }

  initAds();
  await bootAccount();
  refreshChips();
  const api2 = { play, toast, show, hide, finish, showHelp, showBoard, needsHelp: !seen, info };
  window.__bonkShell = api2; // handy for debugging in the console
  return api2;
}
