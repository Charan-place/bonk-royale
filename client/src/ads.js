// Ad layer. Everything is a no-op until js/config.js is filled in, so the game never breaks
// (or shows broken ad boxes) while accounts are still pending approval.
import { SITE } from './config.js';

let sdkReady = false;
let lastInterstitial = 0;
let deaths = 0;

export function adsEnabled() {
  return !!SITE.adsenseClient;
}

export function initAds() {
  if (!adsEnabled()) return;
  const s = document.createElement('script');
  s.async = true;
  s.crossOrigin = 'anonymous';
  s.src =
    'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' +
    encodeURIComponent(SITE.adsenseClient);
  if (SITE.h5Ads) s.setAttribute('data-ad-frequency-hint', '30s');
  s.onload = () => {
    sdkReady = true;
    window.adsbygoogle = window.adsbygoogle || [];
    if (SITE.h5Ads) window.adBreak = window.adConfig = function (o) { (window.adsbygoogle).push(o); };
    if (SITE.h5Ads) window.adConfig({ preloadAdBreaks: 'on', sound: 'on' });
    fillSlots();
  };
  document.head.appendChild(s);
}

/** Turns every <div class="ad" data-slot="rail|banner|result"> into a live ad unit. */
export function fillSlots(root = document) {
  for (const el of root.querySelectorAll('.ad[data-slot]')) {
    const slot = SITE.slots[el.dataset.slot];
    if (!slot || el.dataset.filled) continue;
    if (!sdkReady) continue;
    el.dataset.filled = '1';
    el.classList.add('live');
    const ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.dataset.adClient = SITE.adsenseClient;
    ins.dataset.adSlot = slot;
    ins.dataset.adFormat = 'auto';
    ins.dataset.fullWidthResponsive = 'true';
    el.replaceChildren(ins);
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      /* ad blocker or SDK error: leave the placeholder */
    }
  }
}

/** Called on every death. Shows an interstitial only when cooldowns allow. Always resolves. */
export function maybeInterstitial() {
  deaths++;
  const now = Date.now();
  const due =
    deaths % SITE.interstitialEveryDeaths === 0 &&
    now - lastInterstitial > SITE.interstitialCooldownSec * 1000;
  if (!due) return Promise.resolve(false);
  if (!(SITE.h5Ads && sdkReady && window.adBreak)) return Promise.resolve(false);
  lastInterstitial = now;
  return new Promise((resolve) => {
    window.adBreak({
      type: 'next',
      name: 'between-rounds',
      adBreakDone: () => resolve(true),
    });
    setTimeout(() => resolve(false), 8000);
  });
}

export function rewardedAvailable() {
  return SITE.mockAds || (SITE.h5Ads && sdkReady);
}

/** Resolves true only if the viewer earned the reward. */
export function showRewarded() {
  if (SITE.mockAds && !(SITE.h5Ads && sdkReady)) return mockRewarded();
  if (!(SITE.h5Ads && sdkReady && window.adBreak)) return Promise.resolve(false);
  return new Promise((resolve) => {
    let rewarded = false;
    window.adBreak({
      type: 'reward',
      name: 'bonus-start',
      beforeReward: (show) => show(),
      adViewed: () => (rewarded = true),
      adDismissed: () => (rewarded = false),
      adBreakDone: () => resolve(rewarded),
    });
    setTimeout(() => resolve(rewarded), 60000);
  });
}

function mockRewarded() {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'mock-ad';
    box.innerHTML = '<div><b>Test ad</b><span id="mockSec">3</span></div>';
    document.body.appendChild(box);
    let n = 3;
    const iv = setInterval(() => {
      n--;
      box.querySelector('#mockSec').textContent = String(n);
      if (n <= 0) {
        clearInterval(iv);
        box.remove();
        resolve(true);
      }
    }, 1000);
  });
}
