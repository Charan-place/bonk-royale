// A "session" hides where the match runs. LocalSession runs the shared sim in the browser
// (practice vs bots, and offline fallback); OnlineSession (net.js) mirrors a server-run match.
// Both expose: update(dt), view(now), flick(angle, power), emote(k), close(), and callbacks.
import { createMatch, stepMatch, flick, emote, drainEvents, results, C, TILE_CHARS } from '../../shared/sim.js';
import { TEAM_COLORS } from '../../shared/cosmetics.js';

export function tileView(t) {
  return { st: t.st, hp: t.hp };
}

export function puckView(p, m) {
  return {
    id: p.id,
    pid: p.pid,
    name: p.name,
    kind: p.kind,
    col: p.col,
    hat: p.hat,
    trail: p.trail,
    team: p.team,
    teamColor: m.mode === 'team' ? TEAM_COLORS[(p.team - 1) % TEAM_COLORS.length] : null,
    bot: p.bot,
    x: p.x,
    y: p.y,
    vx: p.vx,
    vy: p.vy,
    r: p.r,
    angle: p.angle,
    cd: p.cd,
    cdMax: C.cooldown,
    state: p.state,
    lives: Math.max(0, p.lives),
    fallT: p.fallT,
    mega: p.megaT > 0,
    shield: p.shieldT > 0,
    rocket: p.rocket || p.rocketT > 0,
    gems: p.gems,
  };
}

export class LocalSession {
  constructor({ mode = 'ffa', players, difficulty = 0.4, meId, onEvent, onOver }) {
    this.kind = 'local';
    this.mode = mode;
    this.meId = meId;
    this.m = createMatch({ mode, players, difficulty });
    this.onEvent = onEvent;
    this.onOver = onOver;
    this.over = false;
    this.acc = 0;
  }

  update(dt) {
    this.acc += Math.min(dt, 0.1);
    const step = 1 / C.tick;
    while (this.acc >= step) {
      this.acc -= step;
      stepMatch(this.m, step);
    }
    const events = drainEvents(this.m);
    for (const e of events) this.onEvent(e);
    if (this.m.phase === 'over' && !this.over && this.m.overT > 3.2) {
      this.over = true;
      this.onOver(results(this.m), this.m);
    }
  }

  view() {
    const m = this.m;
    return {
      mode: m.mode,
      phase: m.phase,
      pt: m.pt,
      t: m.t,
      tiles: m.tiles.map(tileView),
      pucks: m.pucks.map((p) => puckView(p, m)),
      orbs: m.orbs,
      gems: m.gems,
      winner: m.winner,
      collapsedRing: m.collapsedRing,
    };
  }

  flick(angle, power) {
    return flick(this.m, this.meId, angle, power);
  }

  emote(k) {
    emote(this.m, this.meId, k);
  }

  close() {}
}

export { TILE_CHARS };
