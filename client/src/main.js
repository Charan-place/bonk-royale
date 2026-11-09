import '@fontsource/baloo-2/700.css';
import '@fontsource/baloo-2/800.css';
import './ui.css';
import { C, MODES, pointToHex } from '../../shared/sim.js';
import { DIFFS, diffOf } from '../../shared/difficulty.js';
import { mountAccountBox } from './account.js';
import { KINDS, COLORS, HATS, TRAILS, EMOTES, RARITY, nameOf, randomName, displayName, levelProgress } from '../../shared/cosmetics.js';
import { checkName, NAME_MAX } from '../../shared/names.js';
import { Stage } from './scene.js';
import { FlickInput, rangeOf } from './input.js';
import { LocalSession } from './session.js';
import { OnlineSession, Social, PartyLink, api } from './net.js';
import { store } from './store.js';
import { sfx, music, audioPrefs } from './audio.js';
import { initAds, adsEnabled, maybeInterstitial, rewardedAvailable, showRewarded } from './ads.js';

const $ = (id) => document.getElementById(id);
const KIND_ICONS = ['\u{1F431}', '\u{1F430}', '\u{1F43B}', '\u{1F438}', '\u{1F996}', '\u{1F916}', '\u{1F47D}', '\u{1F427}'];
const HAT_ICONS = ['\u{1F6AB}', '\u{1F389}', '\u{1F681}', '\u{1F3A9}', '\u{1F920}', '\u{1F9D9}', '\u{1F451}', '\u{1F607}'];
const TRAIL_ICONS = ['✨', '\u{1F496}', '⭐', '\u{1FAE7}', '\u{1F308}'];
let diff = 'easy';
try {
  diff = diffOf(localStorage.getItem('bonk_diff'));
} catch {
  /* storage can be blocked: stay on the default */
}
const MODE_LABEL = { ffa: 'Free for all', duel: '1 vs 1', team: 'Teams' };

const el = {
  howto: $('howto'), body: document.body, hud: $('hud'), home: $('home'), results: $('results'), lobby: $('lobby'), party: $('party'),
  hearts: $('hudHearts'), gems: $('hudGems'), alive: $('hudAlive'), time: $('hudTime'),
  feed: $('feed'), callouts: $('callouts'), count: $('count'), hint: $('hint'),
  outBar: $('outBar'), outPlace: $('outPlace'), bubbles: $('bubbles'), wheel: $('emoteWheel'),
  meName: $('meName'), meLvl: $('meLvl'), meXp: $('meXp'), meAvatar: $('meAvatar'), coins: $('coins'),
  status: $('homeStatus'), toasts: $('toasts'), power: $('power'), powerFill: $('powerFill'),
};

const stage = new Stage($('gl'));
const stageEl = $('stage');
const params = new URLSearchParams(location.search);

let screen = 'home';
let mode = 'ffa';
let session = null;
let meId = 1;
let idx = new Map();
let aim = { angle: 0, power: 0 };
let buffered = null;
let finished = false;
let lastHearts = -1;
let myInfo = null;
let lastView = null;
let payload = null;
let capBusy = false;
let matchesSinceAd = 0;
let partyState = null;
let resolveParty = null;
const names = new Map();
const bubbles = [];

// ------------------------------------------------------------------ helpers
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const rarityColor = (r) => (RARITY[r] || RARITY.common).color;
const cardName = displayName;

function toast(text, ms = 2600, actions = null) {
  const t = document.createElement('div');
  t.className = 'toast';
  const s = document.createElement('span');
  s.textContent = text;
  t.append(s);
  if (actions) {
    const box = document.createElement('div');
    box.className = 'acts';
    for (const [label, fn] of actions) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn';
      b.textContent = label;
      b.addEventListener('click', () => {
        t.remove();
        fn();
      });
      box.append(b);
    }
    t.append(box);
  }
  el.toasts.append(t);
  while (el.toasts.children.length > 3) el.toasts.firstChild.remove();
  setTimeout(() => t.remove(), ms);
}

function callout(text, cls = '', small = false) {
  const d = document.createElement('div');
  d.className = `callout ${cls} ${small ? 'small' : ''}`;
  d.textContent = text;
  el.callouts.append(d);
  setTimeout(() => d.remove(), 1250);
  while (el.callouts.children.length > 3) el.callouts.firstChild.remove();
}

function feed(text, cls = '') {
  const li = document.createElement('li');
  li.textContent = text;
  li.className = cls;
  el.feed.append(li);
  while (el.feed.children.length > 4) el.feed.firstChild.remove();
  setTimeout(() => li.remove(), 5000);
}

function countUp(node, to, ms = 900) {
  const t0 = performance.now();
  const step = (t) => {
    const f = Math.min(1, (t - t0) / ms);
    node.textContent = Math.round(to * (1 - Math.pow(1 - f, 3)));
    if (f < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function setScreen(s) {
  screen = s;
  el.body.dataset.screen = s === 'match' ? 'match' : 'home';
  el.home.hidden = s !== 'home';
  el.hud.hidden = s !== 'match';
  el.results.hidden = s !== 'results';
  el.lobby.hidden = s !== 'lobby';
  if (s !== 'home') el.party.hidden = true;
  social.setStatus(s === 'match' || s === 'lobby' ? 'match' : partyLink.active ? 'party' : 'menu');
}

const myCosmetics = () => ({ id: 0, name: cardName(store.data), kind: store.data.kind, col: store.data.col, hat: store.data.hat, trail: store.data.trail });

function fillAvatar(node, c) {
  node.textContent = KIND_ICONS[c.kind];
  node.style.background = COLORS[c.col].hex;
}

// ------------------------------------------------------------------ social + party
const social = new Social((m) => {
  if (m.t === 'friendreq') {
    sfx.invite();
    toast(`${cardName(m.from)} wants to be friends!`, 9000, [
      ['Accept', async () => {
        try {
          await api.req('/api/friends/accept', { id: m.from.id });
          toast(`You and ${cardName(m.from)} are friends!`);
          refreshFriends();
        } catch (e) {
          toast(e.message);
        }
      }],
      ['No thanks', () => api.req('/api/friends/decline', { id: m.from.id }).catch(() => {})],
    ]);
    $('friendDot').hidden = false;
  } else if (m.t === 'friendok') {
    sfx.invite();
    toast(`${cardName(m.from)} is now your friend! \u{1F389}`);
    refreshFriends();
  } else if (m.t === 'invite') {
    sfx.invite();
    $('friendDot').hidden = false;
    toast(`${cardName(m.from)} invited you to play ${MODE_LABEL[m.mode] || ''}!`, 12000, [
      ['Join!', () => joinParty(m.party)],
      ['Not now', () => {}],
    ]);
  }
});

const partyLink = new PartyLink({
  onState: (s) => {
    const first = !partyState;
    partyState = s;
    renderParty();
    $('partyChip').hidden = false;
    $('partyChipCode').textContent = s.code;
    if (first && screen === 'home') showParty();
    social.setStatus('party');
    if (resolveParty) {
      resolveParty(s);
      resolveParty = null;
    }
  },
  onGo: ({ room, mode: m }) => {
    el.party.hidden = true;
    mode = m;
    startOnline({ mode: m, room });
  },
  onNotice: (t) => toast(t),
  onClose: (e) => {
    const had = partyState;
    partyState = null;
    $('partyChip').hidden = true;
    el.party.hidden = true;
    if (had && e && e.code === 4003) toast('That party is full.');
    else if (had) toast('You left the party.');
    else if (e && e.code !== 1000) toast("Couldn't join that party. Ask for a new invite!");
    social.setStatus('menu');
  },
});

function joinParty(code) {
  if (!api.remote) return toast('Parties need an internet connection.');
  sfx.click();
  partyLink.join(code);
  showParty();
}

function showParty() {
  if (screen !== 'home') return;
  $('friendsSheet').hidden = true;
  el.party.hidden = false;
  renderParty();
}

function renderParty() {
  const s = partyState;
  if (!s) return;
  $('partyCode').textContent = s.code;
  const me = store.data.id;
  const isLeader = s.leader === me;
  const slots = $('partySlots');
  slots.replaceChildren();
  for (let i = 0; i < 4; i++) {
    const m = s.members[i];
    const d = document.createElement('div');
    d.className = 'slot' + (m ? '' : ' empty');
    if (m) {
      const av = document.createElement('span');
      av.className = 'avatar';
      fillAvatar(av, m);
      const n = document.createElement('small');
      n.textContent = m.id === me ? 'You' : cardName(m);
      d.append(av, n);
      if (m.id === s.leader) d.insertAdjacentHTML('beforeend', '<span class="crown">\u{1F451}</span>');
      if (m.ready) d.insertAdjacentHTML('beforeend', '<span class="ok">✅</span>');
    } else {
      d.innerHTML = '<span class="avatar" style="background:#fff">?</span><small>Invite!</small>';
      d.addEventListener('click', openFriends);
    }
    slots.append(d);
  }
  for (const b of document.querySelectorAll('[data-pmode]')) {
    b.classList.toggle('on', b.dataset.pmode === s.mode);
    b.disabled = !isLeader;
  }
  const go = $('btnPartyGo');
  const mine = s.members.find((m) => m.id === me);
  if (isLeader) go.textContent = 'START!';
  else go.textContent = mine && mine.ready ? 'Ready! (tap to undo)' : "I'm ready!";
  const leader = s.members.find((m) => m.id === s.leader);
  $('partyNote').textContent = isLeader
    ? { ffa: 'Everyone brawls. Bots fill empty spots!', duel: 'A friendly 1 vs 1 duel. Best player wins!', team: 'Two teams. Work together!' }[s.mode]
    : `${leader ? cardName(leader) : 'The leader'} picks the game. Tap ready!`;
  if (s.diff && DIFFS[s.diff]) $('partyNote').textContent += ` Bots: ${DIFFS[s.diff].label}.`;
}

async function ensureParty(modeWanted) {
  if (partyLink.active && partyState) {
    if (modeWanted && partyState.mode !== modeWanted && partyState.leader === store.data.id) partyLink.send({ t: 'mode', v: modeWanted });
    return partyState.code;
  }
  const p = new Promise((res) => (resolveParty = res));
  partyLink.join('NEW');
  const st = await Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))]);
  if (modeWanted && modeWanted !== 'ffa') partyLink.send({ t: 'mode', v: modeWanted });
  partyLink.send({ t: 'diff', v: diff });
  return st.code;
}

async function inviteFriend(friend, wantMode = 'ffa') {
  try {
    const code = await ensureParty(wantMode);
    await api.req('/api/invite', { friendId: friend.id, party: code, mode: wantMode });
    toast(`Invite sent to ${cardName(friend)}!`);
    $('friendsSheet').hidden = true;
    showParty();
  } catch (e) {
    toast(e.message === 'timeout' ? "Couldn't open a party. Try again!" : e.message);
  }
}

// ------------------------------------------------------------------ friends sheet
let friendTimer = 0;
async function openFriends() {
  sfx.click();
  if (!api.remote) return toast('Friends need an internet connection.');
  $('friendsSheet').hidden = false;
  el.party.hidden = true;
  $('myCode').textContent = store.data.code || '';
  $('friendDot').hidden = true;
  await refreshFriends();
  clearInterval(friendTimer);
  friendTimer = setInterval(() => {
    if ($('friendsSheet').hidden) return clearInterval(friendTimer);
    refreshFriends();
  }, 12000);
}

async function refreshFriends() {
  if ($('friendsSheet').hidden || !api.remote) return;
  let d;
  try {
    d = await api.req('/api/friends');
  } catch {
    return;
  }
  const box = $('friendList');
  box.replaceChildren();
  const section = (t) => {
    const h = document.createElement('h4');
    h.textContent = t;
    box.append(h);
  };
  const btn = (label, fn, cls = '') => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn small ${cls}`;
    b.textContent = label;
    b.addEventListener('click', fn);
    return b;
  };
  const row = (c, ...btns) => {
    const r = document.createElement('div');
    r.className = 'frow';
    const av = document.createElement('span');
    av.className = 'avatar';
    fillAvatar(av, c);
    const who = document.createElement('div');
    who.className = 'who';
    const n = document.createElement('span');
    n.textContent = cardName(c);
    const sm = document.createElement('small');
    if (c.online !== undefined) {
      sm.textContent = c.online ? (c.status === 'match' ? 'Playing a match' : c.status === 'party' ? 'In a party' : 'Online') : 'Offline';
      if (c.online) sm.className = 'on';
    } else sm.textContent = c.code;
    who.append(n, sm);
    r.append(av, who, ...btns);
    box.append(r);
  };
  if (d.incoming.length) {
    section('Friend requests');
    for (const c of d.incoming) {
      row(c, btn('Accept', async () => {
        await api.req('/api/friends/accept', { id: c.id }).catch((e) => toast(e.message));
        refreshFriends();
      }), btn('✕', async () => {
        await api.req('/api/friends/decline', { id: c.id }).catch(() => {});
        refreshFriends();
      }, 'alt'));
    }
  }
  section(`Friends (${d.friends.length})`);
  if (!d.friends.length) {
    const e = document.createElement('div');
    e.className = 'empty-note';
    e.textContent = 'No friends yet. Share your code, or add players you meet in matches!';
    box.append(e);
  }
  for (const c of d.friends) {
    const btns = [];
    if (c.online) btns.push(btn('Invite', () => inviteFriend(c, 'ffa')), btn('1v1', () => inviteFriend(c, 'duel'), 'alt'));
    btns.push(btn('✕', async () => {
      await api.req('/api/friends/remove', { id: c.id }).catch(() => {});
      refreshFriends();
    }, 'alt'));
    row(c, ...btns);
  }
  if (d.outgoing.length) {
    section('Waiting for an answer');
    for (const c of d.outgoing) row(c);
  }
}

// ------------------------------------------------------------------ home
function renderHome() {
  const d = store.data;
  el.meName.textContent = cardName(d);
  const p = levelProgress(d.xp);
  el.meLvl.textContent = `Lv ${p.lv}`;
  el.meXp.style.width = `${Math.round(p.f * 100)}%`;
  el.coins.textContent = d.coins;
  el.meAvatar.textContent = KIND_ICONS[d.kind];
  el.meAvatar.style.background = COLORS[d.col].hex;
  $('giftDot').hidden = !store.giftReady();
  $('myCode').textContent = d.code || '';
}

function showcaseView() {
  const c = myCosmetics();
  return {
    mode: 'ffa',
    phase: 'play',
    pt: 0,
    tiles: stage.layout.map(() => ({ st: 'ok', hp: 2 })),
    pucks: [{ ...c, id: 0, team: 0, x: 0, y: 0, vx: 0, vy: 0, r: 64, angle: Math.PI / 2, cd: 0, cdMax: 1, state: 'live', lives: 0, fallT: 0, mega: false, shield: false, rocket: false }],
    orbs: [],
    gems: [],
    collapsedRing: 99,
  };
}

try {
  localStorage.setItem('bonk_last_game', 'royale');
} catch {
  /* ignore */
}
function goHome() {
  if (session) session.close();
  session = null;
  stage.camMode = 'showcase';
  stage.loadArena('ffa');
  stage.aim.visible = false;
  setScreen('home');
  renderHome();
  music.setIntensity(0);
  if (partyState) $('partyChip').hidden = false;
}

// ------------------------------------------------------------------ match setup (shared)
function resetMatchUi() {
  names.clear();
  finished = false;
  lastHearts = -1;
  myInfo = null;
  buffered = null;
  el.feed.replaceChildren();
  el.callouts.replaceChildren();
  el.bubbles.replaceChildren();
  bubbles.length = 0;
  el.outBar.hidden = true;
  el.wheel.hidden = true;
  el.count.innerHTML = '';
}

function beginMatchView(m) {
  stage.loadArena(m);
  idx = new Map(stage.layout.map((t, i) => [t.q + ',' + t.r, i]));
  stage.camMode = 'match';
  stage.camPos.set(0, 1500, 1100);
  mode = m;
  setScreen('match');
  showHint(input.device);
  el.hint.hidden = store.tutorial;
  music.setIntensity(0.3);
}

// ------------------------------------------------------------------ local (offline practice)
function buildLocalPlayers(m) {
  const total = m === 'duel' ? 2 : 8;
  const list = [{ ...myCosmetics(), id: 1, team: 1, bot: false }];
  const used = new Set([list[0].name]);
  const colours = COLORS.map((_, i) => i).filter((i) => i !== list[0].col); // nobody copies the player's colour
  for (let i = 0; i < total - 1; i++) {
    let name;
    do name = nameOf(...randomName());
    while (used.has(name));
    used.add(name);
    list.push({ id: i + 2, name, kind: Math.floor(Math.random() * KINDS.length), col: colours[Math.floor(Math.random() * colours.length)], hat: Math.floor(Math.random() * HATS.length), trail: Math.floor(Math.random() * TRAILS.length), bot: true, team: i + 2 });
  }
  if (m === 'team') list.forEach((p, i) => (p.team = i < 4 ? 1 : 2));
  return list;
}

function startLocal() {
  sfx.unlock();
  music.start();
  resetMatchUi();
  const players = buildLocalPlayers(mode);
  meId = 1;
  for (const p of players) names.set(p.id, p.name);
  const difficulty = DIFFS[diff].skill;
  beginMatchView(mode);
  session = new LocalSession({ mode, players, difficulty, meId, onEvent, onOver: finishLocal });
}

function finishLocal() {
  if (finished || !session || session.kind !== 'local') return;
  finished = true;
  const m = session.m;
  const res = m.pucks.map((p) => ({ id: p.id, place: p.place || 2, kos: p.kos, gems: p.gems, won: !!(m.winner && m.winner.ids.includes(p.id)), survived: Math.round(p.alive || m.pt) }));
  const mine = res.find((r) => r.id === meId);
  const reward = store.applyLocalMatch({ place: mine.place, players: m.pucks.length, kos: mine.kos, gems: mine.gems, won: mine.won, mult: DIFFS[diff].mult });
  payload = { mine, reward, players: m.pucks.length, met: [] };
  showResults();
}

// ------------------------------------------------------------------ online
function startOnline({ mode: m, room = '' }) {
  sfx.unlock();
  music.start();
  resetMatchUi();
  mode = m;
  if (session) session.close();
  $('lobbyTitle').textContent = room ? 'Waiting for friends' : 'Finding players';
  $('lobbySub').textContent = room ? 'The match starts when everyone is here!' : 'Bots join if the room is quiet!';
  $('lobbySlots').replaceChildren();
  $('lobbyCount').textContent = '';
  setScreen('lobby');
  session = new OnlineSession({
    mode: m,
    room,
    diff,
    onEvent,
    onLobby: renderLobby,
    onStart: (s) => {
      resetMatchUi();
      meId = s.you;
      for (const p of s.players) names.set(p.id, p.name);
      beginMatchView(s.mode);
      sfx.count(1);
    },
    onResults: (r) => {
      finished = true;
      if (r.profile) store.adopt(r.profile, store.giftOk);
      nudgeSave();
      payload = {
        mine: r.mine,
        reward: r.reward || { xp: 0, coins: 0, levelBefore: store.level, levelAfter: store.level, levelCapsules: 0 },
        players: r.players,
        met: r.met || [],
      };
      showResults();
    },
    onRematch: (r) => {
      $('btnRematch').textContent = r.total > 1 ? `Waiting... (${r.ready}/${r.total})` : 'Starting...';
    },
    onClosed: (e, opened) => {
      if (screen === 'home') return;
      session = null;
      toast(opened ? 'Connection lost. Back to the lobby!' : "Couldn't join a room. Try again in a moment!", 3600);
      goHome();
    },
  });
}

function renderLobby(m) {
  const box = $('lobbySlots');
  box.replaceChildren();
  const slots = Math.min(m.need, 8);
  for (let i = 0; i < slots; i++) {
    const p = m.players[i];
    const d = document.createElement('div');
    d.className = 'slot' + (p ? '' : ' empty');
    if (p) {
      const av = document.createElement('span');
      av.className = 'avatar';
      fillAvatar(av, p);
      const n = document.createElement('small');
      n.textContent = p.id === store.data.id ? 'You' : cardName(p);
      d.append(av, n);
    } else d.innerHTML = '<span class="avatar" style="background:#fff">?</span><small>Waiting</small>';
    box.append(d);
  }
  $('lobbyCount').textContent = m.startsIn > 0 ? m.startsIn : 'Go!';
  if (m.startsIn <= 3 && m.startsIn > 0) sfx.tick();
}

// ------------------------------------------------------------------ events (both session kinds)
function onEvent(e) {
  stage.event(e, lastView);
  switch (e.type) {
    case 'count':
      el.count.innerHTML = `<span>${e.n}</span>`;
      sfx.count(e.n);
      break;
    case 'start':
      el.count.innerHTML = '<span style="color:var(--sun)">GO!</span>';
      sfx.count(0);
      setTimeout(() => (el.count.innerHTML = ''), 900);
      break;
    case 'flick':
      if (e.id === meId) {
        sfx.flick(e.p);
        el.hint.hidden = true;
        if (!store.tutorial) store.markTutorial();
      }
      break;
    case 'hit':
      sfx.hit(Math.min(1, e.s / 900));
      if (e.a === meId || e.b === meId) navigator.vibrate && navigator.vibrate(e.a === meId ? 25 : 45);
      if (e.a === meId && !e.bank) callout(['BONK!', 'WHAM!', 'BOING!', 'SMACK!'][Math.floor(Math.random() * 4)], 'sky');
      break;
    case 'bounce':
      sfx.bounce();
      break;
    case 'bank':
      if (e.id === meId) callout('BANK SHOT!', 'pink');
      sfx.bank();
      break;
    case 'combo':
      if (e.id === meId) {
        callout(`COMBO x${e.n}!`, 'mint', true);
        sfx.combo(e.n);
      }
      break;
    case 'warn':
      callout('The edge is crumbling!', 'pink', true);
      sfx.warn();
      break;
    case 'tilefall':
      sfx.tilefall();
      break;
    case 'orb':
      if (e.id === meId) {
        callout({ mega: 'MEGA BONKLING!', shield: 'SHIELD UP!', rocket: 'ROCKET FLICK!', quake: 'QUAKE!' }[e.kind], '');
        sfx.orb();
      }
      break;
    case 'gem':
      if (e.id === meId) sfx.gem();
      break;
    case 'respawn':
      if (e.id === meId) sfx.respawn();
      break;
    case 'emote':
      showEmote(e.id, e.k);
      break;
    case 'ko': {
      const who = names.get(e.id) || '?';
      const by = e.by ? names.get(e.by) : null;
      sfx.ko();
      sfx.fall();
      if (e.by === meId) {
        callout(e.multi >= 3 ? 'TRIPLE SPLASH!' : e.multi === 2 ? 'DOUBLE SPLASH!' : 'SPLASH!', 'pink');
        feed(`You bonked ${who} off!`, 'me');
      } else if (e.id === meId) {
        feed(by ? `${by} bonked you off!` : 'You fell off!', 'bad');
        if (e.lives > 0) callout(`OUCH! ${e.lives} ${e.lives === 1 ? 'heart' : 'hearts'} left`, 'pink', true);
        else {
          callout("YOU'RE OUT!", 'pink');
          setTimeout(() => {
            if (screen === 'match' && !finished) {
              el.outPlace.textContent = `You placed #${e.place}`;
              el.outBar.hidden = false;
            }
          }, 900);
        }
      } else feed(by ? `${by} bonked ${who} off!` : `${who} fell off!`);
      if (e.left <= 2 && e.lives <= 0) stage.cinematic = 1.4;
      music.setIntensity(e.left <= 3 ? 1 : 0.6);
      break;
    }
    case 'over': {
      const won = e.winner.ids.includes(meId);
      callout(won ? 'VICTORY!' : `${names.get(e.winner.ids[0]) || 'Someone'} wins!`, won ? 'sun' : 'sky');
      won ? sfx.win() : sfx.lose();
      break;
    }
  }
}

function showEmote(id, k) {
  const b = document.createElement('div');
  b.className = EMOTES[k].length > 2 ? 'bubble txt' : 'bubble';
  b.textContent = EMOTES[k];
  el.bubbles.append(b);
  bubbles.push({ id, b, until: performance.now() + 1600 });
  sfx.emote();
}

// ------------------------------------------------------------------ results
function showResults() {
  const { mine, reward, players } = payload;
  setScreen('results');
  $('btnRematch').textContent = 'Play again';
  $('resTitle').textContent = mine.won ? 'Victory!' : mine.place === 2 ? 'So close!' : mine.place === 3 ? 'Top 3!' : 'Good game!';
  $('resTrophy').textContent = mine.won ? '\u{1F3C6}' : mine.place === 2 ? '\u{1F948}' : mine.place === 3 ? '\u{1F949}' : '\u{1F388}';
  $('resSub').textContent = `You placed ${mine.place} of ${players}`;
  $('resKos').textContent = mine.kos;
  $('resGems').textContent = mine.gems;
  $('resTime').textContent = fmt(mine.survived);
  const d = store.data;
  const before = levelProgress(d.xp - reward.xp);
  const after = levelProgress(d.xp);
  const bar = $('resBar');
  bar.style.transition = 'none';
  bar.style.width = `${Math.round(before.f * 100)}%`;
  $('resLvl').textContent = `Lv ${before.lv}`;
  $('resLevelUp').textContent = '';
  countUp($('resXp'), reward.xp);
  countUp($('resCoins'), reward.coins);
  sfx.tick();
  setTimeout(() => {
    bar.style.transition = 'width 0.9s cubic-bezier(.2,.8,.2,1)';
    if (after.lv > before.lv) {
      bar.style.width = '100%';
      setTimeout(() => {
        sfx.level();
        $('resLvl').textContent = `Lv ${after.lv}`;
        $('resLevelUp').textContent = `Level up! +${reward.levelCapsules} capsule${reward.levelCapsules > 1 ? 's' : ''}`;
        bar.style.transition = 'none';
        bar.style.width = '0%';
        void bar.offsetWidth;
        bar.style.transition = 'width 0.6s ease-out';
        bar.style.width = `${Math.round(after.f * 100)}%`;
      }, 950);
    } else bar.style.width = `${Math.round(after.f * 100)}%`;
  }, 350);
  refreshCapsuleButton();
  renderMet(payload.met);
  $('btnAdBonus').hidden = !(api.remote && rewardedAvailable());
  stage.fx.confetti(0, 100, 0, mine.won ? 120 : 30, 900);
  matchesSinceAd++;
}

function renderMet(list) {
  const box = $('metBox');
  const inner = $('metList');
  inner.replaceChildren();
  box.hidden = !list || !list.length || !api.remote;
  if (box.hidden) return;
  for (const c of list) {
    const r = document.createElement('div');
    r.className = 'met-row';
    const n = document.createElement('span');
    n.textContent = `${KIND_ICONS[c.kind]} ${cardName(c)}`;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn small';
    b.textContent = 'Add friend';
    b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        const out = await api.req('/api/friends/add', { metId: c.id });
        b.textContent = out.status === 'friend' ? 'Friends!' : 'Sent ✓';
        sfx.orb();
      } catch (e) {
        b.textContent = 'Oops';
        toast(e.message);
      }
    });
    r.append(n, b);
    inner.append(r);
  }
}

function refreshCapsuleButton() {
  const n = store.data.capsules;
  const b = $('btnCapsule');
  b.hidden = n <= 0;
  b.innerHTML = `<span class="cap">\u{1F381}</span> Open capsule${n > 1 ? `s (${n})` : ''}!`;
}

// ------------------------------------------------------------------ capsule
function itemIcon(info) {
  if (info.type === 'kind') return KIND_ICONS[info.idx];
  if (info.type === 'hat') return HAT_ICONS[info.idx];
  if (info.type === 'trail') return TRAIL_ICONS[info.idx];
  return `<span class="swatch" style="display:inline-block;width:90px;height:90px;background:${COLORS[info.idx].hex}"></span>`;
}

function openCapsuleFlow() {
  if (capBusy || store.data.capsules <= 0) return;
  capBusy = true;
  sfx.unlock();
  const big = $('capBig');
  const reveal = $('capReveal');
  $('capsuleView').hidden = false;
  reveal.hidden = true;
  big.hidden = false;
  big.classList.remove('shake');
  $('capHint').hidden = false;
  $('capHint').textContent = 'Tap the capsule!';
  let busy = false;
  const go = async () => {
    if (busy) return;
    busy = true;
    big.removeEventListener('click', go);
    $('capHint').textContent = '...';
    big.classList.add('shake');
    sfx.rumble();
    let r = null;
    try {
      [r] = await Promise.all([store.openCapsule(), new Promise((res) => setTimeout(res, 1300))]);
    } catch (e) {
      toast(e.message);
    }
    big.classList.remove('shake');
    big.hidden = true;
    $('capHint').hidden = true;
    if (!r) return closeCapsule();
    const info = r.item;
    reveal.style.setProperty('--rc', rarityColor(r.rarity));
    $('capRarity').textContent = RARITY[r.rarity].label;
    $('capIcon').innerHTML = itemIcon(info);
    $('capName').textContent = `${info.name}${info.type === 'hat' ? ' hat' : info.type === 'trail' ? ' trail' : info.type === 'col' ? ' color' : ''}`;
    $('capNote').textContent = r.duplicate ? `Already yours! +${r.coins} coins instead` : 'New! Equipped for you.';
    reveal.hidden = false;
    sfx.reveal(r.rarity);
    if (r.rarity === 'epic' || r.rarity === 'legendary') stage.fx.confetti(0, 100, 0, 100, 900);
    renderHome();
  };
  big.addEventListener('click', go);
  setTimeout(go, 6000);
}

function closeCapsule() {
  $('capsuleView').hidden = true;
  capBusy = false;
  refreshCapsuleButton();
  if (screen === 'results' && store.data.capsules > 0) setTimeout(openCapsuleFlow, 250);
}

// ------------------------------------------------------------------ style sheet
let tab = 'kind';
const TABS = [['kind', 'Character'], ['col', 'Color'], ['hat', 'Hat'], ['trail', 'Trail']];
const LISTS = { kind: KINDS, col: COLORS, hat: HATS, trail: TRAILS };

function renderStyle() {
  const tabs = $('styleTabs');
  tabs.replaceChildren();
  for (const [k, label] of TABS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.className = k === tab ? 'on' : '';
    b.addEventListener('click', () => {
      tab = k;
      sfx.click();
      renderStyle();
    });
    tabs.append(b);
  }
  const grid = $('styleGrid');
  grid.replaceChildren();
  LISTS[tab].forEach((it, i) => {
    const owned = store.owns(`${tab}:${i}`);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `item ${store.data[tab] === i ? 'on' : ''} ${owned ? '' : 'locked'}`;
    b.style.setProperty('--rc', rarityColor(it.rarity));
    b.title = it.name;
    const ico = document.createElement('span');
    ico.className = 'ico';
    ico.innerHTML = itemIcon({ type: tab, idx: i });
    b.append(ico);
    if (!owned) b.insertAdjacentHTML('beforeend', '<span class="lock">\u{1F512}</span>');
    b.addEventListener('click', async () => {
      sfx.click();
      if (!owned) return toast(`${it.name} is hiding in the capsules. Play matches to find it!`);
      try {
        await store.equip(tab, i);
      } catch (e) {
        toast(e.message);
      }
      renderStyle();
      renderHome();
    });
    grid.append(b);
  });
  $('styleName').textContent = cardName(store.data);
  $('nameInput').value = store.data.alias || '';
}

// ------------------------------------------------------------------ input
const pullAngle = (dx, dy) => Math.atan2(dy / 0.87, dx);

function tryFlick(a, p) {
  if (!session || !myInfo) return false;
  if (session.kind === 'online' && myInfo.cd > 0.06) return false;
  return session.flick(a, p);
}

const nearestRivalAngle = () => {
  if (!myInfo || !lastView) return 0;
  let best = null;
  let bd = Infinity;
  for (const p of lastView.pucks) {
    if (p.id === meId || p.state !== 'live' || p.team === myInfo.team) continue;
    const d = Math.hypot(p.x - myInfo.x, p.y - myInfo.y);
    if (d < bd) {
      bd = d;
      best = Math.atan2(p.y - myInfo.y, p.x - myInfo.x);
    }
  }
  return best ?? 0;
};

const HINTS = {
  touch: '<span class="hand">\u{1F446}</span><b>Drag back &amp; let go to flick!</b>',
  mouse: '<span class="hand">\u{1F5B1}\uFE0F</span><b>Point with the mouse &middot; click to BONK &middot; hold for more power</b>',
  key: '<span class="hand">\u2328\uFE0F</span><b>&larr; &rarr; to aim &middot; tap SPACE to BONK &middot; hold for more power</b>',
};
function showHint(device) {
  el.hint.innerHTML = HINTS[device];
  el.body.dataset.input = device;
}

const input = new FlickInput(stageEl, {
  getOrigin: () => (myInfo ? stage.project(myInfo.x, myInfo.y, 40) : null),
  cursorToWorld: (x, y) => {
    if (!myInfo) return null;
    const [gx, gy] = stage.unproject(x, y);
    return [gx - myInfo.x, gy - myInfo.y];
  },
  getDefaultAngle: nearestRivalAngle,
  onDevice: showHint,
  isActive: () => screen === 'match' && session && !finished && myInfo && myInfo.state === 'live' && lastView && lastView.phase !== 'over',
  onAim: (dx, dy, power, preview = false) => {
    if (!power) {
      aim = { angle: aim.angle, power: 0 };
      stage.aim.visible = false;
      return;
    }
    let angle = pullAngle(dx, dy);
    if (myInfo && lastView) {
      let best = null;
      let bd = 0.26;
      for (const p of lastView.pucks) {
        if (p.id === meId || p.state !== 'live' || p.team === myInfo.team) continue;
        let d = Math.atan2(p.y - myInfo.y, p.x - myInfo.x) - angle;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        if (Math.abs(d) < bd) {
          bd = Math.abs(d);
          best = d;
        }
      }
      if (best !== null) angle += best * 0.65;
    }
    aim = { angle, power, preview };
  },
  onFlick: (dx, dy, power) => {
    if (!session) return;
    if (!tryFlick(aim.angle, power)) buffered = { a: aim.angle, power, until: performance.now() + 380 };
  },
});

// ------------------------------------------------------------------ HUD
function updateHud(view) {
  const me = myInfo;
  if (me) {
    if (me.lives !== lastHearts) {
      lastHearts = me.lives;
      const max = MODES[view.mode].lives;
      el.hearts.innerHTML = Array.from({ length: max }, (_, i) => `<span class="${i < me.lives ? '' : 'lost'}">♥</span>`).join('');
    }
    el.gems.textContent = me.gems || 0;
  }
  el.alive.textContent = view.pucks.filter((p) => p.state === 'live' || (p.state === 'falling' && p.lives > 0)).length;
  const N = MODES[view.mode].radius;
  let t;
  if (view.phase === 'over') t = 'Done!';
  else if (view.collapsedRing - 1 >= 1) {
    const nextAt = C.firstCollapse + (N - view.collapsedRing + 1) * C.collapseEvery;
    const left = Math.max(0, nextAt - view.pt);
    t = left <= 5 ? `⚠️ ${Math.ceil(left)}s` : `⏳ ${fmt(left)}`;
  } else t = fmt(view.pt);
  el.time.textContent = t;
}

function updateBubbles(view, now) {
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    const p = view.pucks.find((q) => q.id === b.id);
    if (!p || now > b.until) {
      b.b.remove();
      bubbles.splice(i, 1);
      continue;
    }
    const [x, y] = stage.project(p.x, p.y, p.r * 2.2 + 110);
    b.b.style.left = x + 'px';
    b.b.style.top = y + 'px';
  }
}

// ------------------------------------------------------------------ main loop
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  let view = null;
  if (screen === 'match' && session) {
    session.update(dt);
    view = session.view(now);
  }
  input.update(dt);
  el.power.hidden = !(input.live > 0);
  if (input.live > 0) el.powerFill.style.width = Math.round(input.live * 100) + '%';
  if (view) {
    lastView = view;
    myInfo = view.pucks.find((p) => p.id === meId) || null;
    if (buffered && myInfo) {
      if (now > buffered.until) buffered = null;
      else if (myInfo.cd <= 0.02 && tryFlick(buffered.a, buffered.power)) buffered = null;
    }
    if (myInfo && aim.power > 0 && myInfo.state === 'live') stage.setAim(myInfo, aim.angle, aim.power, rangeOf);
    else stage.aim.visible = false;

    let danger = 0;
    if (myInfo && myInfo.state === 'live' && view.phase === 'play') {
      const [q, r] = pointToHex(myInfo.x, myInfo.y);
      const i = idx.get(q + ',' + r);
      const t = i === undefined ? null : view.tiles[i];
      const ring = i === undefined ? 99 : stage.layout[i].ring;
      if (!t || t.st === 'warn' || t.st === 'shake' || ring >= view.collapsedRing) danger = 1;
    }
    const trails = new Map(view.pucks.map((p) => [p.id, p.trail]));
    stage.frame(view, dt, now, { meId, charging: aim.power > 0.2 && !aim.preview, showRings: false, danger, trails });
    updateHud(view);
    updateBubbles(view, now);
  } else {
    lastView = null;
    stage.frame(showcaseView(), dt, now, { meId: -1, charging: false, showRings: false, danger: 0 });
  }
}

// ------------------------------------------------------------------ play entry points
async function maybeAd() {
  if (matchesSinceAd >= 3 && adsEnabled()) {
    matchesSinceAd = 0;
    await maybeInterstitial();
  }
}

let howtoSeen = false;
try {
  howtoSeen = localStorage.getItem('bonk_howto') === '1';
} catch {
  /* storage blocked: show the guide each visit */
}
let howtoThen = null;
const DEMO_CAPS = { touch: 'Drag back anywhere, then let go!', mouse: 'Point with the mouse, click, then let go!' };
let demoBuilt = false;
function buildDemo() {
  if (demoBuilt) return;
  demoBuilt = true;
  const NS = 'http://www.w3.org/2000/svg';
  const add = (parent, tag, attrs) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    parent.append(n);
    return n;
  };
  const scene = $('demoScene');
  const fills = ['#ff6fa0', '#4fc3ff', '#ffd23f'];
  const size = 21;
  const tiles = add(scene, 'g', {});
  let k = 0;
  for (let q = -2; q <= 2; q++) {
    for (let r = Math.max(-2, -q - 2); r <= Math.min(2, -q + 2); r++) {
      const ring = Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r));
      const x = 160 + size * Math.sqrt(3) * (q + r / 2);
      const y = 100 + size * 1.5 * r;
      const pts = Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        return `${(x + (size - 1.5) * Math.cos(a)).toFixed(1)},${(y + (size - 1.5) * Math.sin(a)).toFixed(1)}`;
      }).join(' ');
      const t = add(tiles, 'polygon', { points: pts, fill: fills[(q - r + 9) % 3], class: ring === 2 ? 'tile edge' : 'tile' });
      if (ring === 2) t.style.animationDelay = `${(k++ % 6) * 0.05}s`;
    }
  }
  // aim dots + power bar
  const dots = add(scene, 'g', { class: 'aimdots' });
  for (let i = 0; i < 5; i++) add(dots, 'circle', { cx: 134 + i * 14, cy: 105, r: 2.2 + i * 0.5, fill: '#fff' });
  add(scene, 'rect', { x: 100, y: 176, width: 120, height: 10, rx: 5, fill: '#fff', stroke: '#2b2150', 'stroke-width': 2 });
  add(scene, 'rect', { x: 101, y: 177, width: 118, height: 8, rx: 4, fill: '#8be04e', class: 'power' });
  // rival
  const rival = add(scene, 'g', { class: 'rival' });
  add(rival, 'circle', { cx: 215, cy: 98, r: 14, fill: '#46d6b0', stroke: '#2b2150', 'stroke-width': 2.5 });
  for (const dx of [-5, 5]) add(rival, 'circle', { cx: 215 + dx, cy: 95, r: 2.4, fill: '#2b2150' });
  add(rival, 'ellipse', { cx: 215, cy: 103, rx: 3, ry: 2, fill: '#4a1f3a' });
  // me
  const me = add(scene, 'g', { class: 'me' });
  add(me, 'ellipse', { cx: 110, cy: 107, rx: 24, ry: 11, fill: 'none', stroke: '#fff', 'stroke-width': 7 });
  add(me, 'ellipse', { cx: 110, cy: 107, rx: 24, ry: 11, fill: 'none', stroke: '#6a2cff', 'stroke-width': 4.5 });
  add(me, 'circle', { cx: 110, cy: 100, r: 15, fill: '#ff6fa0', stroke: '#6a2cff', 'stroke-width': 3.5 });
  for (const dx of [-5, 5]) {
    add(me, 'circle', { cx: 110 + dx, cy: 97, r: 3, fill: '#fff' });
    add(me, 'circle', { cx: 110 + dx, cy: 97.5, r: 1.5, fill: '#2b2150' });
  }
  const tag = add(me, 'g', {});
  add(tag, 'rect', { x: 94, y: 66, width: 32, height: 15, rx: 7.5, fill: '#6a2cff', stroke: '#fff', 'stroke-width': 2 });
  const yt = add(tag, 'text', { x: 110, y: 77.5, 'text-anchor': 'middle', fill: '#fff', 'font-size': 10, 'font-weight': 800 });
  yt.textContent = 'YOU';
  // pointers
  const finger = add(scene, 'text', { x: 108, y: 140, 'font-size': 26, class: 'pt touch' });
  finger.textContent = '\u{1F446}';
  const mouse = add(scene, 'path', { d: 'M0 0 L0 17 L4.5 13 L7.5 20 L10.5 18.7 L7.6 12 L13 12 Z', fill: '#fff', stroke: '#2b2150', 'stroke-width': 1.6, 'stroke-linejoin': 'round', class: 'pt mouse' });
  void mouse;
  // bonk burst, crown
  const bonk = add(scene, 'text', { x: 205, y: 80, 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 800, fill: '#ffd23f', stroke: '#2b2150', 'stroke-width': 4, 'paint-order': 'stroke', class: 'bonk' });
  bonk.textContent = 'BONK!';
  const crown = add(scene, 'text', { x: 168, y: 60, 'text-anchor': 'middle', 'font-size': 24, class: 'crown' });
  crown.textContent = '\u{1F451}';
}
function setDemoDevice() {
  const d = input.device === 'touch' ? 'touch' : 'mouse';
  $('demo').dataset.dev = d;
  $('demoCap').textContent = DEMO_CAPS[d];
}
function showHowto(then = null) {
  howtoThen = then;
  buildDemo();
  setDemoDevice();
  $('btnHowtoGo').textContent = then ? "Got it, let's play!" : 'Got it!';
  el.howto.hidden = false;
  $('btnHowtoGo').focus();
}
$('btnHowtoGo').addEventListener('click', () => {
  sfx.click();
  el.howto.hidden = true;
  howtoSeen = true;
  try {
    localStorage.setItem('bonk_howto', '1');
  } catch {
    /* best effort */
  }
  const next = howtoThen;
  howtoThen = null;
  if (next) next();
});
$('btnHowto').addEventListener('click', () => {
  sfx.click();
  showHowto();
});

async function play() {
  sfx.unlock();
  if (!howtoSeen) return showHowto(play);
  await maybeAd();
  if (!api.remote) return startLocal();
  startOnline({ mode });
}

// ------------------------------------------------------------------ wiring
$('btnPlay').addEventListener('click', () => {
  sfx.click();
  play();
});
for (const b of document.querySelectorAll('.mode:not([data-pmode])')) {
  b.addEventListener('click', () => {
    sfx.click();
    mode = b.dataset.mode;
    for (const o of document.querySelectorAll('.mode:not([data-pmode])')) {
      o.classList.toggle('on', o === b);
      o.setAttribute('aria-checked', String(o === b));
    }
  });
}
function showDiff() {
  for (const o of document.querySelectorAll('[data-diff]')) {
    o.classList.toggle('on', o.dataset.diff === diff);
    o.setAttribute('aria-checked', String(o.dataset.diff === diff));
  }
}
showDiff();
for (const b of document.querySelectorAll('[data-diff]')) {
  b.addEventListener('click', () => {
    sfx.click();
    diff = diffOf(b.dataset.diff);
    try {
      localStorage.setItem('bonk_diff', diff);
    } catch {
      /* best effort */
    }
    showDiff();
    if (api.remote) api.req('/api/prefs', { diff }).catch(() => {});
    if (partyLink.active && partyState && partyState.leader === store.data.id) partyLink.send({ t: 'diff', v: diff });
  });
}
for (const b of document.querySelectorAll('[data-pmode]')) {
  b.addEventListener('click', () => {
    sfx.click();
    partyLink.send({ t: 'mode', v: b.dataset.pmode });
  });
}
$('btnStyle').addEventListener('click', () => {
  sfx.click();
  renderStyle();
  $('styleSheet').hidden = false;
  $('friendsSheet').hidden = true;
});
let renderAccount = () => {};
/** Soft, rare reminder after a few matches. Never blocks play. */
function nudgeSave() {
  const d = store.data;
  if (!api.remote || d.linked || ![1, 5, 15].includes(d.matches)) return;
  setTimeout(() => toast('Save your progress so you never lose it!', 7000, [['Save', openProgress], ['Later', () => {}]]), 4000);
}
function renderProgress() {
  const d = store.data;
  const p = levelProgress(d.xp);
  const total = KINDS.length + COLORS.length + HATS.length + TRAILS.length;
  const av = $('progAvatar');
  av.textContent = KIND_ICONS[d.kind];
  av.style.background = COLORS[d.col].hex;
  $('progName').textContent = cardName(d);
  $('progLvl').textContent = `Level ${p.lv}`;
  $('progXp').style.width = `${Math.round(p.f * 100)}%`;
  $('progNext').textContent = `${Math.max(0, p.hi - d.xp)} XP to level ${p.lv + 1}`;
  const rate = d.matches ? Math.round((d.wins / d.matches) * 100) : 0;
  const stats = [
    [d.matches, 'Matches'],
    [d.wins, 'Wins'],
    [`${rate}%`, 'Win rate'],
    [d.kos, 'Bonks'],
    [`${d.streak || 0} \u{1F525}`, 'Day streak'],
    [`${d.owned.length}/${total}`, 'Collected'],
  ];
  $('progStats').replaceChildren(
    ...stats.map(([v, l]) => {
      const c = document.createElement('div');
      c.className = 'stat';
      const b = document.createElement('b');
      b.textContent = v;
      const sp = document.createElement('span');
      sp.textContent = l;
      c.append(b, sp);
      return c;
    })
  );
  renderAccount();
}
function openProgress() {
  sfx.click();
  renderProgress();
  $('progressSheet').hidden = false;
  $('styleSheet').hidden = true;
  $('friendsSheet').hidden = true;
}
renderAccount = mountAccountBox($('saveBox'), { store, toast, sfx });
$('meCard').addEventListener('click', openProgress);
$('btnProgStyle').addEventListener('click', () => {
  $('progressSheet').hidden = true;
  $('btnStyle').click();
});
for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', () => (b.closest('.sheet').hidden = true));
$('nameInput').maxLength = NAME_MAX;
$('nameForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  sfx.click();
  const r = checkName($('nameInput').value);
  if (!r.ok) return toast(r.error);
  try {
    await store.setName(r.name);
    toast(`Hi ${r.name}! \u{1F44B}`);
  } catch (err) {
    toast(err.message);
  }
  renderStyle();
  renderHome();
});
$('btnDice').addEventListener('click', async () => {
  sfx.click();
  try {
    await store.reroll();
  } catch (e) {
    toast(e.message);
  }
  renderStyle();
  renderHome();
});
$('btnFriends').addEventListener('click', openFriends);
$('partyChip').addEventListener('click', () => {
  sfx.click();
  showParty();
});
$('btnCopyCode').addEventListener('click', async () => {
  sfx.click();
  toast((await copyText(store.data.code)) ? 'Code copied!' : `Your code: ${store.data.code}`);
});
$('addForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('addInput');
  const code = input.value.trim().toUpperCase().replace(/\s+/g, '');
  const full = code.startsWith('BONK-') ? code : `BONK-${code}`;
  if (!/^BONK-[A-HJ-NP-Z2-9]{5}$/.test(full)) return toast('Codes look like BONK-AB3CD');
  try {
    const r = await api.req('/api/friends/add', { code: full });
    toast(r.status === 'friend' ? `You and ${cardName(r.card)} are friends!` : `Request sent to ${cardName(r.card)}!`);
    input.value = '';
    sfx.orb();
    refreshFriends();
  } catch (err) {
    toast(err.message);
  }
});
$('btnPartyShare').addEventListener('click', async () => {
  if (!partyState) return;
  const url = `${location.origin}/?join=${partyState.code}`;
  sfx.click();
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Bonk Royale', text: 'Join my Bonk Royale party!', url });
      return;
    } catch {
      /* cancelled: fall back to copy */
    }
  }
  toast((await copyText(url)) ? 'Invite link copied!' : url, 4000);
});
$('btnPartyInvite').addEventListener('click', openFriends);
$('btnPartyLeave').addEventListener('click', () => {
  sfx.click();
  partyLink.leave();
  partyState = null;
  $('partyChip').hidden = true;
  el.party.hidden = true;
  social.setStatus('menu');
});
$('btnPartyGo').addEventListener('click', () => {
  sfx.click();
  if (!partyState) return;
  if (partyState.leader === store.data.id) partyLink.send({ t: 'start' });
  else {
    const mine = partyState.members.find((m) => m.id === store.data.id);
    partyLink.send({ t: 'ready', v: !(mine && mine.ready) });
  }
});
$('btnLobbyLeave').addEventListener('click', () => {
  sfx.click();
  goHome();
});
$('btnGift').addEventListener('click', async () => {
  sfx.click();
  if (!store.giftReady()) return toast('Come back tomorrow for another gift!');
  const g = await store.claimGift();
  if (!g) return toast('Come back tomorrow for another gift!');
  sfx.orb();
  toast(`\u{1F381} +${g.coins} coins! ${g.streak > 1 ? `Day ${g.streak} streak!` : ''}${g.capsule ? ' Plus a free capsule!' : ''}`, 3600);
  renderHome();
});
$('btnSettings').addEventListener('click', () => {
  const p = audioPrefs.get();
  audioPrefs.setMusic(!p.music);
  audioPrefs.setSfx(!p.music || p.sfx);
  toast(p.music ? 'Music off' : 'Music on');
});
$('btnSound').addEventListener('click', () => {
  const p = audioPrefs.get();
  audioPrefs.setSfx(!p.sfx);
  audioPrefs.setMusic(!p.sfx);
  $('btnSound').textContent = p.sfx ? '\u{1F507}' : '\u{1F50A}';
});
$('btnLeave').addEventListener('click', () => {
  if (session && session.kind === 'online') {
    toast('You left the match.');
    return goHome();
  }
  if (!finished && session) {
    const p = session.m.pucks.find((q) => q.id === meId);
    if (p && p.state !== 'out' && !p.place) p.place = session.m.pucks.length;
  }
  finishLocal();
});
$('btnSkip').addEventListener('click', () => (session && session.kind === 'online' ? toast('Hang on, the match is still going!') : finishLocal()));
$('btnRematch').addEventListener('click', async () => {
  sfx.click();
  if (session && session.kind === 'online' && session.ws) {
    session.rematch();
    $('btnRematch').textContent = 'Waiting for others...';
    return;
  }
  await maybeAd();
  play();
});
$('btnResHome').addEventListener('click', async () => {
  await maybeAd();
  goHome();
});
$('btnAdBonus').addEventListener('click', async () => {
  const b = $('btnAdBonus');
  b.disabled = true;
  const ok = await showRewarded();
  if (ok) {
    try {
      const r = await api.req('/api/ad-bonus', {});
      store.adopt(r.profile, store.giftOk);
      toast('+30 coins! Thanks for watching!');
      b.hidden = true;
    } catch (e) {
      toast(e.message);
    }
  }
  b.disabled = false;
});
$('btnCapsule').addEventListener('click', openCapsuleFlow);
$('btnCapDone').addEventListener('click', () => {
  sfx.click();
  closeCapsule();
});
$('btnEmote').addEventListener('click', () => (el.wheel.hidden = !el.wheel.hidden));
EMOTES.forEach((e, k) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = e;
  b.addEventListener('click', () => {
    if (session) session.emote(k);
    el.wheel.hidden = true;
  });
  el.wheel.append(b);
});

window.addEventListener('resize', () => stage.resize());
window.addEventListener('pointerdown', () => sfx.unlock(), { once: true });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) music.setIntensity(0);
});

if (params.get('ads') === 'preview') document.body.classList.add('preview-ads', 'has-ads');
if (adsEnabled()) document.body.classList.add('has-ads');
store.onChange(renderHome);

// ------------------------------------------------------------------ boot
async function boot() {
  goHome();
  initAds();
  requestAnimationFrame(loop);
  try {
    const me = await api.ensureAccount();
    store.adopt(me.profile, me.giftReady);
    if (me.profile.prefs && me.profile.prefs.diff) {
      diff = diffOf(me.profile.prefs.diff);
      showDiff();
    }
    social.start();
    if (params.get('save') === '1') {
      history.replaceState(null, '', location.pathname);
      openProgress();
    }
    const join = (params.get('join') || '').toUpperCase();
    if (/^[A-HJ-NP-Z2-9]{5}$/.test(join)) {
      history.replaceState(null, '', location.pathname);
      joinParty(join);
    }
  } catch {
    el.status.textContent = 'Offline practice mode: play against bots. Progress stays on this device.';
  }
  renderHome();
}
boot();
window.__bonk = { stage, store, api, get session() { return session; }, get dbg() { return { aim, myInfo, screen, partyState }; } };
