// Player profile. When the server is reachable the profile is owned by the server (every reward,
// capsule roll and unlock happens there); offline, the same pure rules run against a local copy.
import { STARTER, levelOf, itemInfo } from '../../shared/cosmetics.js';
import { newProfile, touchDay, giftReady, claimGift, equip, applyMatch, openCapsule } from '../../shared/progress.js';
import { api } from './net.js';

const KEY = 'bonk_profile_v1';

class Store {
  constructor() {
    this.data = newProfile();
    this.remote = false;
    this.giftOk = true;
    this.listeners = new Set();
    this.tutorial = false;
    this.loadLocal();
  }

  loadLocal() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY));
      if (raw && typeof raw === 'object') this.data = { ...newProfile(), ...raw };
      this.tutorial = localStorage.getItem('bonk_tut') === '1';
    } catch {
      /* storage unavailable or corrupt: keep defaults */
    }
    const d = this.data;
    d.owned = Array.from(new Set([...(Array.isArray(d.owned) ? d.owned : []), ...STARTER])).filter((id) => itemInfo(id));
    for (const t of ['kind', 'col', 'hat', 'trail']) if (!d.owned.includes(`${t}:${d[t]}`)) d[t] = 0;
    touchDay(d);
  }

  markTutorial() {
    this.tutorial = true;
    try {
      localStorage.setItem('bonk_tut', '1');
    } catch {
      /* storage unavailable */
    }
  }

  saveLocal() {
    if (this.remote) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* storage unavailable */
    }
  }

  emit() {
    for (const f of this.listeners) f(this.data);
  }

  onChange(f) {
    this.listeners.add(f);
  }

  /** Server profile replaces the local one. */
  adopt(profile, giftOk) {
    this.remote = true;
    this.data = profile;
    if (typeof giftOk === 'boolean') this.giftOk = giftOk;
    this.emit();
  }

  get level() {
    return levelOf(this.data.xp);
  }

  owns(id) {
    return this.data.owned.includes(id);
  }

  giftReady() {
    return this.remote ? this.giftOk : giftReady(this.data);
  }

  async equip(type, idx) {
    if (!this.owns(`${type}:${idx}`)) return false;
    if (this.remote) {
      const r = await api.req('/api/equip', { type, idx });
      this.adopt(r.profile);
      return true;
    }
    const ok = equip(this.data, type, idx);
    this.saveLocal();
    this.emit();
    return ok;
  }

  async reroll() {
    if (this.remote) {
      const r = await api.req('/api/name/reroll', {});
      return this.adopt(r.profile);
    }
    const { randomName } = await import('../../shared/cosmetics.js');
    this.data.name = randomName();
    this.saveLocal();
    this.emit();
  }

  async claimGift() {
    if (this.remote) {
      try {
        const r = await api.req('/api/gift/claim', {});
        this.giftOk = false;
        this.adopt(r.profile);
        return r.gift;
      } catch {
        this.giftOk = false;
        this.emit();
        return null;
      }
    }
    const g = claimGift(this.data);
    this.saveLocal();
    this.emit();
    return g;
  }

  async openCapsule() {
    if (this.data.capsules <= 0) return null;
    if (this.remote) {
      const r = await api.req('/api/capsule/open', {});
      this.adopt(r.profile);
      return r.result;
    }
    const r = openCapsule(this.data);
    if (r && !r.duplicate) equip(this.data, r.item.type, r.item.idx);
    this.saveLocal();
    this.emit();
    return r;
  }

  /** Offline practice only: online matches are rewarded by the server. */
  applyLocalMatch(r) {
    const out = applyMatch(this.data, r);
    this.saveLocal();
    this.emit();
    return out;
  }
}

export const store = new Store();
