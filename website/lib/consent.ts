// Visitors from these countries are asked before Google's tags may store
// anything: the EEA, the UK and Switzerland.
export const CONSENT_COUNTRIES = [
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR",
  "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO",
  "SE", "SI", "SK", "IS", "LI", "NO", "GB", "CH",
];

// Set by proxy.ts from the country Vercel reads off the visitor's address.
export const REGION_COOKIE = "lpm-consent-region";
export const REGION_ASK = "ask";
export const REGION_SKIP = "skip";

// The visitor's answer, kept in this browser only.
export const CHOICE_KEY = "lpm-consent";
export type ConsentChoice = "granted" | "denied";

// The privacy page's "Change your choice" opens the banner again.
export const CONSENT_OPEN_EVENT = "lpm:consent-open";

export const consentState = (choice: ConsentChoice) => ({
  ad_storage: choice,
  ad_user_data: choice,
  ad_personalization: choice,
  analytics_storage: choice,
});

export function readChoice(): ConsentChoice | null {
  try {
    const choice = localStorage.getItem(CHOICE_KEY);
    return choice === "granted" || choice === "denied" ? choice : null;
  } catch {
    return null;
  }
}

export function asksForConsent(): boolean {
  return document.cookie
    .split("; ")
    .includes(`${REGION_COOKIE}=${REGION_ASK}`);
}

export function saveChoice(choice: ConsentChoice) {
  try {
    localStorage.setItem(CHOICE_KEY, choice);
  } catch {}
  window.gtag?.("consent", "update", consentState(choice));
}

// Runs before the Google tag loads. Storage starts denied for the countries
// above, by Google's reading of the address and, where the region cookie
// says to ask, everywhere; a choice made earlier replaces both.
export const consentDefaultsScript = `
  var consent = function (v) {
    return { ad_storage: v, ad_user_data: v, ad_personalization: v, analytics_storage: v };
  };
  var byRegion = consent('denied');
  byRegion.region = ${JSON.stringify(CONSENT_COUNTRIES)};
  gtag('consent', 'default', byRegion);
  var choice = null;
  try { choice = localStorage.getItem('${CHOICE_KEY}'); } catch (e) {}
  if (choice === 'granted' || choice === 'denied') {
    gtag('consent', 'update', consent(choice));
  } else if (document.cookie.split('; ').indexOf('${REGION_COOKIE}=${REGION_ASK}') !== -1) {
    gtag('consent', 'default', consent('denied'));
  }
  gtag('set', 'ads_data_redaction', true);
`;
