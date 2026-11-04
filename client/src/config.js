// Public, non-secret site configuration. Ad IDs below are public by design (they ship in page HTML
// for every ad network), but leave them empty until the accounts are approved: empty = ads stay off.
export const SITE = {
  // Google AdSense publisher id, e.g. 'ca-pub-0000000000000000'
  adsenseClient: '',
  // Ad unit slot ids from AdSense (display units for the rails and the mobile banner)
  slots: { rail: '', banner: '', result: '' },
  // Enable AdSense for Games (H5) interstitial/rewarded ads once Google approves the account
  h5Ads: false,
  // Show a fake rewarded-ad countdown so the flow can be tested before real ads are live
  mockAds: false,
  // Minimum seconds between interstitials, and deaths between them
  interstitialCooldownSec: 90,
  interstitialEveryDeaths: 3,
};
