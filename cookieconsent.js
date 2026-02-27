/*
    Overview: Consent mode parameters

    Setting Name            Used by Google    Description
    ad_storage              Yes               Enables storage (such as cookies) related to advertising
    analytics_storage       Yes               Enables storage (such as cookies) related to analytics e.g. visit duration
    ad_user_data            Yes               Whether Google’s services can use user data for building advertising audiences
    ad_personalization      Yes               Whether Google’s services can use the data for remarketing
    functionality_storage   No                Enables storage that supports the functionality of the website or app e.g. language settings
    personalization_storage No                Enables storage related to personalization e.g. video recommendations
    security_storage        No                Enables storage related to security such as authentication functionality, fraud prevention, and other user protection
*/

/**
 * Cookie consent manager used by the site-level banner and GTM consent setup.
 *
 * Responsibilities:
 * - Initialize `gtag` consent defaults before GTM is loaded.
 * - Restore and apply previously saved consent preferences from localStorage.
 * - Render/open/close the consent banner UI and sync checkbox states.
 * - Convert UI selections to Google Consent Mode flags.
 * - Persist updates for subsequent visits.
 * - Expose a small public API (`window.cookieconsent`) for banner control.
 */

/** @typedef {'granted'|'denied'} ConsentState */
/**
 * @typedef {Object} ConsentModeState
 * @property {ConsentState} ad_storage
 * @property {ConsentState} analytics_storage
 * @property {ConsentState} ad_user_data
 * @property {ConsentState} ad_personalization
 * @property {ConsentState} functionality_storage
 * @property {ConsentState} personalization_storage
 * @property {ConsentState} security_storage
 * @property {number} [wait_for_update]
 */
/**
 * @typedef {Object} ConsentSelection
 * @property {boolean} necessary
 * @property {boolean} analytics
 * @property {boolean} preferences
 * @property {boolean} marketing
 * @property {boolean} partners
 */

/* ---------------------------
 * Global Analytics Bootstrap
 * --------------------------- */

// Required global queue for `gtag` calls.
window.dataLayer = window.dataLayer || [];
function gtag() { dataLayer.push(arguments); }

/* ---------------------------
 * Static Configuration
 * --------------------------- */

// If true, default-deny is scoped to CONSENT_REGION_LIST only.
// If false, default-deny applies globally (more conservative, less maintenance).
const USE_REGION_LIST = true;

// Regions where consent is required before storing/reading ads/analytics data.
// Keep this aligned with your legal/compliance requirements.
const CONSENT_REGION_LIST = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
  'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES',
  'SE', 'IS', 'LI', 'NO', 'GB', 'CH'
];

// Conservative baseline before explicit user action.
const DEFAULT_CONSENT = {
  'functionality_storage': 'granted',
  'security_storage': 'granted',
  'ad_storage': 'denied',
  'ad_user_data': 'denied',
  'ad_personalization': 'denied',
  'personalization_storage': 'denied',
  'analytics_storage': 'denied',
  'wait_for_update': 500,
};

// Banner markup is injected dynamically so it can be reused site-wide.
const COOKIE_CONSENT_BANNER_DOM = `
  <div id="cookie-consent-banner" class="cookie-consent-banner">
    <h3>This website uses cookies</h3>
    <p>We use cookies to personalise content and ads, to provide social media features and to analyse our traffic. We also share information about your use of our site with our social media, advertising and analytics partners who may combine it with other information that you’ve provided to them or that they’ve collected from your use of their services.</p>
    <div class="cookie-consent-options">
      <label><input id="consent-necessary" type="checkbox" value="Necessary" checked disabled>Necessary</label>
      <label><input id="consent-analytics" type="checkbox" value="Analytics" checked>Analytics</label>
      <label><input id="consent-marketing" type="checkbox" value="Marketing" checked>Marketing</label>
      <label><input id="consent-preferences" type="checkbox" value="Preferences" checked>Preferences</label>
      <label><input id="consent-partners" type="checkbox" value="Partners">Partners</label>
    </div>
    <div class="cookie-consent-buttons">
      <button id="cookie-consent-btn-reject-all" class="cookie-consent-button btn-grayscale">Reject All</button>
      <button id="cookie-consent-btn-accept-some" class="cookie-consent-button btn-outline">Accept Selection</button>
      <button id="cookie-consent-btn-accept-all" class="cookie-consent-button btn-success">Accept All</button>
    </div>
  </div>
`;

/** @type {{ acceptAll: ConsentSelection, rejectAll: ConsentSelection }} */
const CONSENT_SELECTION_PRESETS = {
  acceptAll: {
    necessary: true,
    analytics: true,
    preferences: true,
    marketing: true,
    partners: true
  },
  rejectAll: {
    necessary: true,
    analytics: false,
    preferences: false,
    marketing: false,
    partners: false
  }
};

/* ---------------------------
 * Runtime State
 * --------------------------- */

let cookieConsentBanner = null;
let cookieConsentInitialized = false;
let gtmLoaderPromise = null;
let missingGtmIdWarned = false;

/**
 * Cached banner element references used across handlers to avoid repeated queries.
 * @type {{
 *   necessary: HTMLInputElement,
 *   analytics: HTMLInputElement,
 *   preferences: HTMLInputElement,
 *   marketing: HTMLInputElement,
 *   partners: HTMLInputElement,
 *   acceptAllButton: HTMLButtonElement,
 *   acceptSomeButton: HTMLButtonElement,
 *   rejectAllButton: HTMLButtonElement
 * } | null}
 */
let cookieConsentElements = null;

/* ---------------------------
 * Utility Functions
 * --------------------------- */

/**
 * Reads previously persisted consent state from localStorage.
 *
 * @returns {ConsentModeState|null} Parsed consent state, or null when unavailable/invalid.
 */
function getStoredConsent() {
  try {
    return JSON.parse(localStorage.getItem('consentMode'));
  } catch (e) {
    return null;
  }
}

/**
 * Ensures stored consent has the full key set expected by consent update calls.
 * Missing keys receive safe defaults.
 *
 * @param {Partial<ConsentModeState>|null} consent
 * @returns {ConsentModeState|null}
 */
function normalizeConsentForUpdate(consent) {
  if (!consent || typeof consent !== 'object') return null;

  const normalized = {
    'ad_storage': 'denied',
    'analytics_storage': 'denied',
    'ad_user_data': 'denied',
    'ad_personalization': 'denied',
    'functionality_storage': 'granted',
    'personalization_storage': 'denied',
    'security_storage': 'granted',
  };

  Object.keys(normalized).forEach((key) => {
    if (consent[key]) normalized[key] = consent[key];
  });

  return normalized;
}

/** @returns {boolean} */
function dnt() {
  return (navigator.doNotTrack == '1' || window.doNotTrack == '1');
}

/** @returns {boolean} */
function gpc() {
  return (navigator.globalPrivacyControl || window.globalPrivacyControl);
}

/* ---------------------------
 * GTM Loading
 * --------------------------- */

/**
 * Injects GTM script exactly once for a given GTM container ID.
 *
 * @param {string} gtmId
 * @returns {Promise<void>}
 */
function loadGtmById(gtmId) {
  if (!gtmId) return Promise.resolve();
  if (gtmLoaderPromise) return gtmLoaderPromise;

  gtmLoaderPromise = new Promise((resolve, reject) => {
    if (document.querySelector('script[data-gtm-loader]')) {
      resolve();
      return;
    }

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(gtmId);
    script.setAttribute('data-gtm-loader', 'true');
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  return gtmLoaderPromise;
}

/* ---------------------------
 * Consent State Updates
 * --------------------------- */

/**
 * Maps user selections from the banner UI to Google Consent Mode values.
 * DNT/GPC reduce grants for related ad tracking fields when those browser
 * privacy signals are enabled.
 *
 * @param {ConsentSelection} consent
 */
function setConsent(consent) {
  const consentMode = {
    'ad_storage': (consent.marketing && !dnt()) ? 'granted' : 'denied',
    'analytics_storage': (consent.analytics && !dnt()) ? 'granted' : 'denied',
    'ad_user_data': (consent.marketing && !dnt()) ? 'granted' : 'denied',
    'ad_personalization': (consent.partners && !gpc()) ? 'granted' : 'denied',
    'functionality_storage': consent.necessary ? 'granted' : 'denied',
    'personalization_storage': consent.preferences ? 'granted' : 'denied',
    'security_storage': consent.necessary ? 'granted' : 'denied',
  };

  window.cookieconsent.consentMode = consentMode;
  gtag('consent', 'update', consentMode);
  gtag('set', 'ads_data_redaction', consentMode.ad_storage === 'denied');
  localStorage.setItem('consentMode', JSON.stringify(consentMode));
}

/* ---------------------------
 * Banner UI Helpers
 * --------------------------- */

function showBanner() {
  if (!cookieConsentBanner || !cookieConsentElements) return;

  const cm = getStoredConsent();
  if (cm && cm.functionality_storage) {
    if (cm.functionality_storage == 'granted') {
      cookieConsentElements.necessary.checked = true;
      cookieConsentElements.necessary.disabled = true;
    } else {
      cookieConsentElements.necessary.checked = false;
      cookieConsentElements.necessary.disabled = false;
    }

    cookieConsentElements.analytics.checked = (cm.analytics_storage == 'granted');
    cookieConsentElements.preferences.checked = (cm.personalization_storage == 'granted');
    cookieConsentElements.marketing.checked = (cm.ad_storage == 'granted');
    cookieConsentElements.partners.checked = (cm.ad_personalization == 'granted');
  }

  cookieConsentBanner.style.display = 'flex';
}

function hideBanner() {
  if (!cookieConsentBanner) return;
  cookieConsentBanner.style.display = 'none';
}

/** @returns {ConsentSelection} */
function readSelectionFromInputs() {
  if (!cookieConsentElements) return CONSENT_SELECTION_PRESETS.rejectAll;

  return {
    necessary: true,
    analytics: cookieConsentElements.analytics.checked,
    preferences: cookieConsentElements.preferences.checked,
    marketing: cookieConsentElements.marketing.checked,
    partners: cookieConsentElements.partners.checked,
  };
}

/**
 * @param {ConsentSelection} selection
 */
function applySelectionAndClose(selection) {
  setConsent(selection);
  hideBanner();
}

/* ---------------------------
 * Banner Initialization
 * --------------------------- */

function initCookieConsentBanner() {
  if (cookieConsentInitialized || !document.body) return;
  cookieConsentInitialized = true;

  document.body.insertAdjacentHTML('beforeend', COOKIE_CONSENT_BANNER_DOM);
  cookieConsentBanner = document.body.lastElementChild;
  if (!cookieConsentBanner) return;

  cookieConsentElements = {
    necessary: cookieConsentBanner.querySelector('#consent-necessary'),
    analytics: cookieConsentBanner.querySelector('#consent-analytics'),
    preferences: cookieConsentBanner.querySelector('#consent-preferences'),
    marketing: cookieConsentBanner.querySelector('#consent-marketing'),
    partners: cookieConsentBanner.querySelector('#consent-partners'),
    acceptAllButton: cookieConsentBanner.querySelector('#cookie-consent-btn-accept-all'),
    acceptSomeButton: cookieConsentBanner.querySelector('#cookie-consent-btn-accept-some'),
    rejectAllButton: cookieConsentBanner.querySelector('#cookie-consent-btn-reject-all')
  };

  Array.from(document.querySelectorAll('.cookie-consent-banner-open')).forEach((btn) => {
    btn.addEventListener('click', () => {
      showBanner();
    });
  });

  if (window.localStorage.getItem('consentMode')) {
    hideBanner();
  } else {
    showBanner();
  }

  cookieConsentElements.acceptAllButton.addEventListener('click', () => {
    applySelectionAndClose(CONSENT_SELECTION_PRESETS.acceptAll);
  });

  cookieConsentElements.acceptSomeButton.addEventListener('click', () => {
    applySelectionAndClose(readSelectionFromInputs());
  });

  cookieConsentElements.rejectAllButton.addEventListener('click', () => {
    applySelectionAndClose(CONSENT_SELECTION_PRESETS.rejectAll);
  });
}

/* ---------------------------
 * Public API
 * --------------------------- */

window.cookieconsent = Object.assign(window.cookieconsent || {}, {
  show: () => {
    initCookieConsentBanner();
    showBanner();
  },
  hide: hideBanner,
  setConsent
});

function getConfiguredGtmId() {
  // Preferred config object with legacy global fallback.
  const gtmId = (window.cookieconsentConfig && window.cookieconsentConfig.gtmId) ||
    window.COOKIECONSENT_GTM_ID;

  if (!gtmId && !missingGtmIdWarned) {
    missingGtmIdWarned = true;
    console.warn('cookieconsent: no GTM ID configured (window.cookieconsentConfig.gtmId or window.COOKIECONSENT_GTM_ID), skipping GTM load.');
  }

  return gtmId;
}

/* ---------------------------
 * Boot Sequence
 * --------------------------- */

gtag('set', 'url_passthrough', true);

if (USE_REGION_LIST) {
  gtag('consent', 'default', Object.assign({}, DEFAULT_CONSENT, { region: CONSENT_REGION_LIST }));
}
gtag('consent', 'default', DEFAULT_CONSENT);
gtag('set', 'ads_data_redaction', true);

const normalizedStoredConsent = normalizeConsentForUpdate(getStoredConsent());
if (normalizedStoredConsent) {
  gtag('consent', 'update', normalizedStoredConsent);
  gtag('set', 'ads_data_redaction', normalizedStoredConsent.ad_storage === 'denied');
}

// GTM is optional here: if no ID is configured, loading is skipped.
loadGtmById(getConfiguredGtmId()).catch(() => {});

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initCookieConsentBanner, { once: true });
} else {
  initCookieConsentBanner();
}
