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

// Consent storage uses a small versioned envelope so the schema can evolve
// without breaking older installs.
const CONSENT_STORAGE_KEY = 'consentMode';
const CONSENT_STORAGE_SCHEMA_VERSION = 1;
const CONSENT_STORAGE_DEFAULT_MAX_AGE_DAYS = 365;

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
  <div id="cookie-consent-banner" class="cookie-consent-banner" role="dialog" aria-modal="true" aria-labelledby="cookie-consent-title" aria-describedby="cookie-consent-description" tabindex="-1" hidden>
    <div id="gpc-notice" class="gpc-notice" role="alert" hidden>
      <span class="gpc-notice-icon">🛡</span>
      <span>Your browser has sent a <strong>Global Privacy Control</strong> signal. Data collection has been disabled automatically. You may close this notice.</span>
    </div>
    <h3 id="cookie-consent-title">This website uses cookies</h3>
    <p id="cookie-consent-description">We use cookies to personalise content and ads, to provide social media features and to analyse our traffic. We also share information about your use of our site with our social media, advertising and analytics partners who may combine it with other information that you've provided to them or that they've collected from your use of their services.</p>
    <fieldset class="cookie-consent-options">
      <legend class="cookie-consent-legend">Choose which categories to allow</legend>
      <label class="cookie-consent-label--disabled" for="consent-necessary"><input id="consent-necessary" type="checkbox" value="Necessary" checked disabled>Necessary</label>
      <label for="consent-analytics"><input id="consent-analytics" type="checkbox" value="Analytics" checked>Analytics</label>
      <label for="consent-marketing"><input id="consent-marketing" type="checkbox" value="Marketing" checked>Marketing</label>
      <label for="consent-preferences"><input id="consent-preferences" type="checkbox" value="Preferences" checked>Preferences</label>
      <label for="consent-partners"><input id="consent-partners" type="checkbox" value="Partners">Partners</label>
    </fieldset>
    <div class="cookie-consent-buttons" role="group" aria-label="Cookie consent actions">
      <button id="cookie-consent-btn-reject-all" type="button" class="cookie-consent-button btn-grayscale">Reject All</button>
      <button id="cookie-consent-btn-accept-some" type="button" class="cookie-consent-button btn-outline">Accept Selection</button>
      <button id="cookie-consent-btn-accept-all" type="button" class="cookie-consent-button btn-success">Accept All</button>
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
let lastFocusedElement = null;

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
  const record = getStoredConsentRecord();
  return record ? record.consentMode : null;
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
    if (consent[key] === 'granted' || consent[key] === 'denied') {
      normalized[key] = consent[key];
    }
  });

  return normalized;
}

/**
 * @param {unknown} value
 * @returns {value is ConsentSelection}
 */
function isConsentSelection(value) {
  return !!value &&
    typeof value === 'object' &&
    typeof value.necessary === 'boolean' &&
    typeof value.analytics === 'boolean' &&
    typeof value.preferences === 'boolean' &&
    typeof value.marketing === 'boolean' &&
    typeof value.partners === 'boolean';
}

/**
 * @param {unknown} value
 * @returns {value is ConsentModeState}
 */
function isConsentModeState(value) {
  if (!value || typeof value !== 'object') return false;

  return [
    'ad_storage',
    'analytics_storage',
    'ad_user_data',
    'ad_personalization',
    'functionality_storage',
    'personalization_storage',
    'security_storage'
  ].every((key) => value[key] === 'granted' || value[key] === 'denied');
}

/**
 * @returns {number}
 */
function getConsentStorageMaxAgeMs() {
  const configValue = window.cookieconsentConfig && Number(window.cookieconsentConfig.consentStorageMaxAgeDays);
  const maxAgeDays = Number.isFinite(configValue) && configValue > 0
    ? configValue
    : CONSENT_STORAGE_DEFAULT_MAX_AGE_DAYS;
  return maxAgeDays * 24 * 60 * 60 * 1000;
}

/**
 * @param {string} key
 * @returns {string|null}
 */
function safeLocalStorageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

/**
 * @param {string} key
 * @param {string} value
 * @returns {boolean}
 */
function safeLocalStorageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * @param {string} key
 */
function safeLocalStorageRemove(key) {
  try {
    window.localStorage.removeItem(key);
  } catch (e) {
    // Ignore storage failures; consent handling must remain functional.
  }
}

/**
 * @param {ConsentSelection} selection
 * @returns {ConsentModeState}
 */
function mapSelectionToConsentMode(selection) {
  return {
    'ad_storage': (selection.marketing && !dnt()) ? 'granted' : 'denied',
    'analytics_storage': (selection.analytics && !dnt()) ? 'granted' : 'denied',
    'ad_user_data': (selection.marketing && !dnt()) ? 'granted' : 'denied',
    'ad_personalization': (selection.partners && !gpc()) ? 'granted' : 'denied',
    'functionality_storage': selection.necessary ? 'granted' : 'denied',
    'personalization_storage': selection.preferences ? 'granted' : 'denied',
    'security_storage': selection.necessary ? 'granted' : 'denied',
  };
}

/**
 * @param {ConsentModeState} consentMode
 * @param {ConsentSelection|null} selection
 * @param {string} source
 * @returns {object}
 */
function buildConsentRecord(consentMode, selection, source) {
  const now = new Date().toISOString();
  return {
    schemaVersion: CONSENT_STORAGE_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    source,
    expiresAt: new Date(Date.now() + getConsentStorageMaxAgeMs()).toISOString(),
    consentMode,
    selection: selection || null
  };
}

/**
 * @param {unknown} rawRecord
 * @returns {{
 *   schemaVersion: number,
 *   createdAt: string,
 *   updatedAt: string,
 *   source: string,
 *   expiresAt: string | null,
 *   consentMode: ConsentModeState,
 *   selection: ConsentSelection | null,
 *   migrated: boolean
 * } | null}
 */
function normalizeStoredConsentRecord(rawRecord) {
  if (!rawRecord || typeof rawRecord !== 'object') return null;

  if (rawRecord.schemaVersion === CONSENT_STORAGE_SCHEMA_VERSION && isConsentModeState(rawRecord.consentMode)) {
    if (rawRecord.expiresAt != null && typeof rawRecord.expiresAt !== 'string') {
      return null;
    }

    if (rawRecord.expiresAt && typeof rawRecord.expiresAt === 'string') {
      const expiresAt = Date.parse(rawRecord.expiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
        return null;
      }
    }

    const createdAt = typeof rawRecord.createdAt === 'string' ? rawRecord.createdAt : new Date().toISOString();
    const updatedAt = typeof rawRecord.updatedAt === 'string' ? rawRecord.updatedAt : createdAt;

    return {
      schemaVersion: CONSENT_STORAGE_SCHEMA_VERSION,
      createdAt,
      updatedAt,
      source: typeof rawRecord.source === 'string' ? rawRecord.source : 'stored',
      expiresAt: typeof rawRecord.expiresAt === 'string' ? rawRecord.expiresAt : null,
      consentMode: normalizeConsentForUpdate(rawRecord.consentMode),
      selection: isConsentSelection(rawRecord.selection) ? rawRecord.selection : null,
      migrated: false
    };
  }

  if (isConsentModeState(rawRecord)) {
    return {
      schemaVersion: CONSENT_STORAGE_SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: 'legacy',
      expiresAt: null,
      consentMode: normalizeConsentForUpdate(rawRecord),
      selection: null,
      migrated: true
    };
  }

  return null;
}

/**
 * @param {boolean} [allowMigration=true]
 * @returns {{
 *   schemaVersion: number,
 *   createdAt: string,
 *   updatedAt: string,
 *   source: string,
 *   expiresAt: string | null,
 *   consentMode: ConsentModeState,
 *   selection: ConsentSelection | null,
 *   migrated: boolean
 * } | null}
 */
function readStoredConsentRecord(allowMigration = true) {
  const raw = safeLocalStorageGet(CONSENT_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    const normalized = normalizeStoredConsentRecord(parsed);

    if (!normalized) {
      safeLocalStorageRemove(CONSENT_STORAGE_KEY);
      return null;
    }

    if (normalized.migrated && allowMigration) {
      persistConsentRecord(normalized.consentMode, normalized.selection, 'migration');
    }

    return normalized;
  } catch (e) {
    safeLocalStorageRemove(CONSENT_STORAGE_KEY);
    return null;
  }
}

/**
 * @returns {{
 *   schemaVersion: number,
 *   createdAt: string,
 *   updatedAt: string,
 *   source: string,
 *   expiresAt: string | null,
 *   consentMode: ConsentModeState,
 *   selection: ConsentSelection | null,
 *   migrated: boolean
 * } | null}
 */
function getStoredConsentRecord() {
  return readStoredConsentRecord(true);
}

/**
 * @param {ConsentModeState} consentMode
 * @param {ConsentSelection|null} selection
 * @param {string} source
 */
function persistConsentRecord(consentMode, selection, source) {
  const previous = readStoredConsentRecord(false);
  const record = previous
    ? {
        schemaVersion: CONSENT_STORAGE_SCHEMA_VERSION,
        createdAt: previous.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source,
        expiresAt: new Date(Date.now() + getConsentStorageMaxAgeMs()).toISOString(),
        consentMode,
        selection: selection || previous.selection || null
      }
    : buildConsentRecord(consentMode, selection, source);

  if (!safeLocalStorageSet(CONSENT_STORAGE_KEY, JSON.stringify(record))) {
    // Storage is best-effort. Consent still applies in-memory.
  }
}

/* ---------------------------
 * GPC (Global Privacy Control)
 * --------------------------- */

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

function pushConsentUpdatedEvent(consentMode) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: 'consent_updated',
    consent: consentMode,
    ad_storage: consentMode.ad_storage,
    analytics_storage: consentMode.analytics_storage,
    ad_user_data: consentMode.ad_user_data,
    ad_personalization: consentMode.ad_personalization
  });
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
  if (!isConsentSelection(consent)) return;

  const consentMode = mapSelectionToConsentMode(consent);

  window.cookieconsent.consentMode = consentMode;
  gtag('consent', 'update', consentMode);
  window.setTimeout(() => {
    pushConsentUpdatedEvent(consentMode);
  }, 50);
  gtag('set', 'ads_data_redaction', consentMode.ad_storage === 'denied');
  persistConsentRecord(consentMode, consent, 'user_action');
}

/* ---------------------------
 * Banner UI Helpers
 * --------------------------- */

/**
 * When GPC is active, lock all non-necessary toggles and show the GPC notice.
 * The user cannot override this — consent stays at deny-all.
 */
function applyGpcLock() {
  if (!cookieConsentElements) return;

  const gpcNotice = cookieConsentBanner.querySelector('#gpc-notice');
  if (gpcNotice) {
    gpcNotice.hidden = false;
  }

  // Hide the entire options fieldset — everything is locked anyway,
  // so this saves vertical space especially on mobile.
  const optionsFieldset = cookieConsentBanner.querySelector('.cookie-consent-options');
  if (optionsFieldset) {
    optionsFieldset.hidden = true;
  }
  // Hide Accept All and Accept Selection; keep Reject All so the user can dismiss.
  cookieConsentElements.acceptAllButton.hidden = true;
  cookieConsentElements.acceptSomeButton.hidden = true;

  // Lock non-necessary checkboxes: unchecked + disabled (for programmatic checks)
  cookieConsentElements.analytics.checked = false;
  cookieConsentElements.analytics.disabled = true;
  cookieConsentElements.preferences.checked = false;
  cookieConsentElements.preferences.disabled = true;
  cookieConsentElements.marketing.checked = false;
  cookieConsentElements.marketing.disabled = true;
  cookieConsentElements.partners.checked = false;
  cookieConsentElements.partners.disabled = true;

  // Mark checkboxes as GPC-locked for CSS styling
  [
    cookieConsentElements.analytics,
    cookieConsentElements.preferences,
    cookieConsentElements.marketing,
    cookieConsentElements.partners
  ].forEach((input) => {
    input.setAttribute('aria-disabled', 'true');
    input.setAttribute('data-gpc-locked', 'true');
  });

  // Disable Accept All and Accept Selection; only Reject All remains
  cookieConsentElements.acceptAllButton.disabled = true;
  cookieConsentElements.acceptAllButton.setAttribute('aria-disabled', 'true');
  cookieConsentElements.acceptSomeButton.disabled = true;
  cookieConsentElements.acceptSomeButton.setAttribute('aria-disabled', 'true');
}

function showBanner() {
  if (!cookieConsentBanner || !cookieConsentElements) return;

  if (gpc()) {
    applyGpcLock();
  } else {
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
  }

  lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  cookieConsentBanner.hidden = false;
  cookieConsentBanner.style.display = 'flex';
  cookieConsentBanner.setAttribute('aria-hidden', 'false');
  window.setTimeout(() => {
    const focusTarget = cookieConsentElements.rejectAllButton || cookieConsentBanner;
    if (focusTarget && typeof focusTarget.focus === 'function') {
      focusTarget.focus();
    }
  }, 0);
}

function hideBanner(restoreFocus = true) {
  if (!cookieConsentBanner) return;
  cookieConsentBanner.hidden = true;
  cookieConsentBanner.style.display = 'none';
  cookieConsentBanner.setAttribute('aria-hidden', 'true');
  if (restoreFocus && lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    window.setTimeout(() => {
      lastFocusedElement.focus();
    }, 0);
  }
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

/**
 * @param {KeyboardEvent} event
 */
function handleBannerKeydown(event) {
  if (!cookieConsentBanner || cookieConsentBanner.hidden) return;

  if (event.key === 'Tab') {
    const focusableElements = Array.from(cookieConsentBanner.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    )).filter((element) => element instanceof HTMLElement);

    if (!focusableElements.length) return;

    const first = /** @type {HTMLElement} */ (focusableElements[0]);
    const last = /** @type {HTMLElement} */ (focusableElements[focusableElements.length - 1]);
    const activeElement = document.activeElement;

    if (event.shiftKey && activeElement === first) {
      last.focus();
      event.preventDefault();
    } else if (!event.shiftKey && activeElement === last) {
      first.focus();
      event.preventDefault();
    }
  }
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
    necessary: /** @type {HTMLInputElement} */ (cookieConsentBanner.querySelector('#consent-necessary')),
    analytics: /** @type {HTMLInputElement} */ (cookieConsentBanner.querySelector('#consent-analytics')),
    preferences: /** @type {HTMLInputElement} */ (cookieConsentBanner.querySelector('#consent-preferences')),
    marketing: /** @type {HTMLInputElement} */ (cookieConsentBanner.querySelector('#consent-marketing')),
    partners: /** @type {HTMLInputElement} */ (cookieConsentBanner.querySelector('#consent-partners')),
    acceptAllButton: /** @type {HTMLButtonElement} */ (cookieConsentBanner.querySelector('#cookie-consent-btn-accept-all')),
    acceptSomeButton: /** @type {HTMLButtonElement} */ (cookieConsentBanner.querySelector('#cookie-consent-btn-accept-some')),
    rejectAllButton: /** @type {HTMLButtonElement} */ (cookieConsentBanner.querySelector('#cookie-consent-btn-reject-all'))
  };

  cookieConsentBanner.addEventListener('keydown', handleBannerKeydown);

  Array.from(document.querySelectorAll('.cookie-consent-banner-open')).forEach((btn) => {
    btn.addEventListener('click', () => {
      showBanner();
    });
  });

  if (getStoredConsent()) {
    hideBanner(false);
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

  // If GPC is active, show the banner with the GPC notice and locked controls.
  // Consent defaults are already deny-all at boot, so no further action is needed.
  if (gpc()) {
    showBanner();
  }
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
  setConsent,
  gpcActive: gpc()
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
} else {
  gtag('consent', 'default', DEFAULT_CONSENT);
}
gtag('set', 'ads_data_redaction', true);

const normalizedStoredConsent = normalizeConsentForUpdate(getStoredConsent());
if (normalizedStoredConsent) {
  gtag('consent', 'update', normalizedStoredConsent);
  gtag('set', 'ads_data_redaction', normalizedStoredConsent.ad_storage === 'denied');
}

const consentModeForBootEvent = normalizedStoredConsent || normalizeConsentForUpdate(DEFAULT_CONSENT);
if (consentModeForBootEvent) {
  window.cookieconsent.consentMode = consentModeForBootEvent;
  window.setTimeout(() => {
    pushConsentUpdatedEvent(consentModeForBootEvent);
  }, 0);
}

// GTM is optional here: if no ID is configured, loading is skipped.
loadGtmById(getConfiguredGtmId()).catch(() => {});

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initCookieConsentBanner, { once: true });
} else {
  initCookieConsentBanner();
}
