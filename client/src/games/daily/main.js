// Daily Bonk: crack the secret lineup of 4 creatures in 8 tries. Same puzzle for everyone, new every day.
import { createShell } from '../../platform/shell.js';
import { sfx } from '../../audio.js';
import { dayKey } from '../../../../shared/progress.js';

const shell = await createShell({
  game: 'daily',
  help: {
    text: 'Guess the secret lineup of 4 creatures (they can repeat). A green dot means the right creature in the right spot, a yellow dot means right creature, wrong spot.',
    controls: [['\u{1F446}', 'Tap creatures, then Guess'], ['\u{1F5B1}️', 'Click creatures'], ['⌨️', 'Keys 1-6, Enter']],
  },
});

const ICONS = ['\u{1F431}', '\u{1F430}', '\u{1F43B}', '\u{1F438}', '\u{1F996}', '\u{1F916}'];
const NAMES = ['Kitty', 'Bunny', 'Bear', 'Froggy', 'Dino', 'Robo'];
const SLOTS = 4;
const TRIES = 8;
const EPOCH = Date.UTC(2026, 10, 1);

const day = dayKey();
const puzzleNo = Math.floor((Date.now() - EPOCH) / 86400000) + 1;

// same secret for everyone on the same UTC day
function seeded(str) {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = seeded('bonk-daily-' + day);
const secret = Array.from({ length: SLOTS }, () => Math.floor(rnd() * ICONS.length));

export function score(guess, answer) {
  let exact = 0;
  const g = [];
  const a = [];
  for (let i = 0; i < SLOTS; i++) {
    if (guess[i] === answer[i]) exact++;
    else {
      g.push(guess[i]);
      a.push(answer[i]);
    }
  }
  let near = 0;
  for (const x of g) {
    const k = a.indexOf(x);
    if (k >= 0) {
      near++;
      a.splice(k, 1);
    }
  }
  return { exact, near };
}

const KEY = 'bonk_daily_' + day;
let state = { rows: [], done: false, won: false, reported: false };
try {
  const s = JSON.parse(localStorage.getItem(KEY));
  if (s && Array.isArray(s.rows)) state = s;
} catch {
  /* fresh day */
}
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
};

let cur = [];
let startedAt = performance.now();

const root = document.createElement('div');
root.className = 'dly';
shell.play.append(root);
const el = (t, c, txt) => {
  const n = document.createElement(t);
  if (c) n.className = c;
  if (txt != null) n.textContent = txt;
  return n;
};

const title = el('p', 'dly-title', `Daily Bonk #${puzzleNo}`);
const board = el('div', 'dly-board');
const msg = el('p', 'dly-msg');
const pal = el('div', 'dly-pal');
const acts = el('div', 'dly-acts');
const back = el('button', 'btn alt small', '⌫');
back.type = 'button';
back.setAttribute('aria-label', 'Delete');
const go = el('button', 'btn small', 'Guess');
go.type = 'button';
acts.append(back, go);
ICONS.forEach((ic, i) => {
  const b = el('button', 'dly-pick');
  b.type = 'button';
  b.setAttribute('aria-label', NAMES[i]);
  b.append(el('span', '', ic), el('small', '', String(i + 1)));
  b.addEventListener('click', () => pick(i));
  pal.append(b);
});
root.append(title, board, msg, pal, acts);

function peg(kind) {
  const s = el('i', 'peg ' + kind);
  return s;
}

function render() {
  board.replaceChildren();
  for (let r = 0; r < TRIES; r++) {
    const row = el('div', 'dly-row' + (r === state.rows.length && !state.done ? ' cur' : ''));
    const cells = el('div', 'dly-cells');
    const g = r < state.rows.length ? state.rows[r] : r === state.rows.length && !state.done ? cur : [];
    for (let i = 0; i < SLOTS; i++) cells.append(el('span', 'dly-cell' + (g[i] != null ? ' f' : ''), g[i] != null ? ICONS[g[i]] : ''));
    const pegs = el('div', 'dly-pegs');
    if (r < state.rows.length) {
      const sc = score(state.rows[r], secret);
      for (let i = 0; i < sc.exact; i++) pegs.append(peg('ex'));
      for (let i = 0; i < sc.near; i++) pegs.append(peg('nr'));
      for (let i = sc.exact + sc.near; i < SLOTS; i++) pegs.append(peg('no'));
    }
    row.append(cells, pegs);
    board.append(row);
  }
  go.disabled = state.done || cur.length !== SLOTS;
  back.disabled = state.done || !cur.length;
  pal.classList.toggle('off', state.done);
  if (state.done) {
    msg.textContent = state.won ? `You cracked it in ${state.rows.length}!` : `Out of tries! It was ${secret.map((i) => ICONS[i]).join(' ')}`;
  } else msg.textContent = `${TRIES - state.rows.length} tries left`;
}

function pick(i) {
  if (state.done || cur.length >= SLOTS) return;
  cur.push(i);
  sfx.click();
  render();
}
back.addEventListener('click', () => {
  cur.pop();
  sfx.click();
  render();
});
go.addEventListener('click', submit);
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || state.done) return;
  if (/^[1-6]$/.test(e.key)) pick(Number(e.key) - 1);
  else if (e.key === 'Backspace') {
    cur.pop();
    render();
  } else if (e.key === 'Enter' && cur.length === SLOTS) submit();
});

function shareText() {
  const grid = state.rows
    .map((r) => {
      const s = score(r, secret);
      return '\u{1F7E9}'.repeat(s.exact) + '\u{1F7E8}'.repeat(s.near) + '⬜'.repeat(SLOTS - s.exact - s.near);
    })
    .join('\n');
  return `Daily Bonk #${puzzleNo} ${state.won ? state.rows.length : 'X'}/${TRIES}\n${grid}\nhttps://playbonkroyale.com/play/daily/`;
}

function nextIn() {
  const n = new Date();
  const next = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1);
  const m = Math.max(0, Math.floor((next - n.getTime()) / 60000));
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

async function showEnd() {
  const tries = state.rows.length;
  const pts = state.won ? (TRIES + 1 - tries) * 120 : 60;
  const first = !state.reported;
  await shell.finish({
    score: pts,
    ms: Math.max(4000, performance.now() - startedAt),
    report: first,
    title: state.won ? 'Cracked it!' : 'So close!',
    lines: [state.won ? `${tries} of ${TRIES} tries` : `It was ${secret.map((i) => ICONS[i]).join(' ')}`, `Next puzzle in ${nextIn()}`],
    againLabel: 'Share result',
    onAgain: async () => {
      const text = shareText();
      try {
        if (navigator.share) await navigator.share({ text });
        else {
          await navigator.clipboard.writeText(text);
          shell.toast('Copied! Paste it to your friends.');
        }
      } catch {
        /* share cancelled */
      }
    },
    extraButtons: [['See my guesses', shell.hide]],
  });
  if (first) {
    state.reported = true;
    save();
  }
}

function submit() {
  if (cur.length !== SLOTS || state.done) return;
  const guess = [...cur];
  state.rows.push(guess);
  cur = [];
  const sc = score(guess, secret);
  if (sc.exact === SLOTS) {
    state.done = true;
    state.won = true;
  } else if (state.rows.length >= TRIES) state.done = true;
  save();
  sc.exact === SLOTS ? sfx.win() : sc.exact + sc.near ? sfx.bank() : sfx.bounce();
  render();
  if (state.done) setTimeout(showEnd, 700);
}

render();
if (state.done) setTimeout(showEnd, 400);
else if (shell.needsHelp) shell.showHelp();
