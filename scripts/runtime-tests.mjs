import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const source = fs.readFileSync(path.join(root, 'cookieconsent.js'), 'utf8');

class FakeElement {
  constructor(document, tagName, id = null) {
    this.ownerDocument = document;
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.hidden = false;
    this.style = { display: 'none' };
    this.attributes = {};
    this.listeners = new Map();
    this.checked = false;
    this.disabled = false;
    this.value = '';
    this.className = '';
    this.textContent = '';
    this.children = [];
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(handler);
  }

  dispatchEvent(event) {
    const handlers = this.listeners.get(event.type) || [];
    handlers.forEach((handler) => handler.call(this, event));
  }

  focus() {
    this.ownerDocument.activeElement = this;
    this.focused = true;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  querySelector(selector) {
    return this._queryMap ? this._queryMap[selector] || null : null;
  }

  querySelectorAll(selector) {
    if (!this._queryAllMap) return [];
    return this._queryAllMap[selector] || [];
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }
}

class FakeInputElement extends FakeElement {}
class FakeButtonElement extends FakeElement {}

class FakeBodyElement extends FakeElement {
  insertAdjacentHTML(position, html) {
    if (position !== 'beforeend') {
      throw new Error('Unexpected insertAdjacentHTML position: ' + position);
    }

    const banner = new FakeElement(this.ownerDocument, 'div', 'cookie-consent-banner');
    banner.hidden = true;
    banner.style.display = 'none';
    banner._queryMap = Object.create(null);
    banner._queryAllMap = Object.create(null);

    const necessary = new FakeInputElement(this.ownerDocument, 'input', 'consent-necessary');
    necessary.checked = true;
    necessary.disabled = true;
    necessary.value = 'Necessary';

    const analytics = new FakeInputElement(this.ownerDocument, 'input', 'consent-analytics');
    analytics.checked = true;
    analytics.value = 'Analytics';

    const marketing = new FakeInputElement(this.ownerDocument, 'input', 'consent-marketing');
    marketing.checked = true;
    marketing.value = 'Marketing';

    const preferences = new FakeInputElement(this.ownerDocument, 'input', 'consent-preferences');
    preferences.checked = true;
    preferences.value = 'Preferences';

    const partners = new FakeInputElement(this.ownerDocument, 'input', 'consent-partners');
    partners.checked = false;
    partners.value = 'Partners';

    const rejectAll = new FakeButtonElement(this.ownerDocument, 'button', 'cookie-consent-btn-reject-all');
    const acceptSome = new FakeButtonElement(this.ownerDocument, 'button', 'cookie-consent-btn-accept-some');
    const acceptAll = new FakeButtonElement(this.ownerDocument, 'button', 'cookie-consent-btn-accept-all');

    banner._queryMap['#consent-necessary'] = necessary;
    banner._queryMap['#consent-analytics'] = analytics;
    banner._queryMap['#consent-marketing'] = marketing;
    banner._queryMap['#consent-preferences'] = preferences;
    banner._queryMap['#consent-partners'] = partners;
    banner._queryMap['#cookie-consent-btn-reject-all'] = rejectAll;
    banner._queryMap['#cookie-consent-btn-accept-some'] = acceptSome;
    banner._queryMap['#cookie-consent-btn-accept-all'] = acceptAll;
    banner._queryAllMap['button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'] = [
      rejectAll,
      acceptSome,
      acceptAll,
      analytics,
      marketing,
      preferences,
      partners
    ];

    this.ownerDocument._elementsById.set('cookie-consent-banner', banner);
    [
      necessary,
      analytics,
      marketing,
      preferences,
      partners,
      rejectAll,
      acceptSome,
      acceptAll
    ].forEach((element) => {
      this.ownerDocument._elementsById.set(element.id, element);
    });

    this.ownerDocument.lastBanner = banner;
    this.lastElementChild = banner;
  }
}

class FakeHeadElement extends FakeElement {
  appendChild(child) {
    super.appendChild(child);
    this.ownerDocument.appendedScripts.push(child);
    if (typeof child.onload === 'function') {
      child.onload();
    }
    return child;
  }
}

class FakeDocument {
  constructor({ readyState = 'complete', openButtons = 0 } = {}) {
    this.readyState = readyState;
    this._elementsById = new Map();
    this.appendedScripts = [];
    this.activeElement = null;
    this.lastBanner = null;
    this.body = new FakeBodyElement(this, 'body');
    this.head = new FakeHeadElement(this, 'head');
    this._openButtons = Array.from({ length: openButtons }, (_, index) => {
      const button = new FakeButtonElement(this, 'div', 'open-button-' + index);
      button.className = 'cookie-consent-banner-open';
      return button;
    });
  }

  createElement(tagName) {
    if (tagName.toLowerCase() === 'script') {
      const script = new FakeElement(this, 'script');
      script.async = false;
      return script;
    }

    return new FakeElement(this, tagName);
  }

  addEventListener() {}

  querySelector(selector) {
    if (selector === 'script[data-gtm-loader]') {
      return this.appendedScripts.find((script) => script.attributes['data-gtm-loader'] === 'true') || null;
    }

    if (selector.startsWith('#')) {
      return this.getElementById(selector.slice(1));
    }

    return null;
  }

  querySelectorAll(selector) {
    if (selector === '.cookie-consent-banner-open') {
      return this._openButtons;
    }

    return [];
  }

  getElementById(id) {
    return this._elementsById.get(id) || null;
  }
}

class LocalStorageMock {
  constructor(initial = {}) {
    this.store = new Map(Object.entries(initial));
  }

  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }

  setItem(key, value) {
    this.store.set(key, String(value));
  }

  removeItem(key) {
    this.store.delete(key);
  }
}

function createRuntime({ storage = {}, readyState = 'complete', gtmId = 'GTM-TEST', openButtons = 0 } = {}) {
  const document = new FakeDocument({ readyState, openButtons });
  const localStorage = new LocalStorageMock(storage);
  const timers = [];

  const sandbox = {
    console,
    Date,
    JSON,
    Math,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    TypeError,
    Promise,
    encodeURIComponent,
    decodeURIComponent,
    isFinite,
    isNaN,
    setTimeout(fn) {
      timers.push(fn);
      fn();
      return timers.length;
    },
    clearTimeout() {},
    window: null,
    self: null,
    globalThis: null,
    document,
    localStorage,
    navigator: {},
    dataLayer: [],
    cookieconsentConfig: { gtmId },
    globalPrivacyControl: false,
    doNotTrack: '0'
  };

  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.HTMLElement = FakeElement;
  sandbox.HTMLInputElement = FakeInputElement;
  sandbox.HTMLButtonElement = FakeButtonElement;
  document.ownerDocument = document;
  document.body.ownerDocument = document;
  document.head.ownerDocument = document;

  vm.runInNewContext(source, sandbox, { filename: 'cookieconsent.js' });

  return { window: sandbox, document, localStorage, timers };
}

function parsedConsent(runtime) {
  const raw = runtime.localStorage.getItem('consentMode');
  return raw ? JSON.parse(raw) : null;
}

function gtagCalls(runtime, eventName) {
  return runtime.window.dataLayer
    .map((entry) => Array.from(entry))
    .filter((entry) => entry[0] === eventName);
}

function testFreshBoot() {
  const runtime = createRuntime();
  const banner = runtime.document.getElementById('cookie-consent-banner');
  const rejectAll = runtime.document.getElementById('cookie-consent-btn-reject-all');
  const acceptAll = runtime.document.getElementById('cookie-consent-btn-accept-all');

  assert.ok(runtime.window.cookieconsent, 'public API should exist');
  assert.equal(typeof runtime.window.cookieconsent.show, 'function');
  assert.equal(typeof runtime.window.cookieconsent.hide, 'function');
  assert.equal(typeof runtime.window.cookieconsent.setConsent, 'function');

  assert.ok(banner, 'banner should be injected');
  assert.equal(banner.hidden, false, 'banner should be visible on first boot');
  assert.equal(runtime.document.activeElement, acceptAll, 'banner should focus the accept action');

  const defaults = gtagCalls(runtime, 'consent').find((entry) => entry[1] === 'default');
  assert.ok(defaults, 'default consent call should be sent');
  assert.ok(Array.isArray(defaults[2].region), 'region-scoped default should include a region list');
  assert.equal(gtagCalls(runtime, 'consent').filter((entry) => entry[1] === 'default').length, 1, 'only one default consent call should be issued');
}

function testLegacyMigration() {
  const legacyConsent = {
    ad_storage: 'granted',
    analytics_storage: 'denied',
    ad_user_data: 'granted',
    ad_personalization: 'denied',
    functionality_storage: 'granted',
    personalization_storage: 'denied',
    security_storage: 'granted'
  };

  const runtime = createRuntime({
    storage: {
      consentMode: JSON.stringify(legacyConsent)
    }
  });

  const stored = parsedConsent(runtime);
  const banner = runtime.document.getElementById('cookie-consent-banner');

  assert.ok(stored, 'legacy consent should be migrated into storage');
  assert.equal(stored.schemaVersion, 1);
  assert.equal(stored.source, 'migration');
  assert.ok(stored.createdAt, 'migrated envelope should include createdAt');
  assert.ok(stored.updatedAt, 'migrated envelope should include updatedAt');
  assert.ok(stored.expiresAt, 'migrated envelope should include expiresAt');
  assert.deepEqual(stored.selection, null);
  assert.deepEqual(stored.consentMode, legacyConsent);
  assert.equal(runtime.window.cookieconsent.consentMode.ad_storage, 'granted', 'boot state should reflect migrated consent');
  assert.equal(banner.hidden, true, 'banner should stay hidden when stored consent exists');
}

function testMalformedStorageClears() {
  const runtime = createRuntime({
    storage: {
      consentMode: '{bad-json'
    }
  });

  const banner = runtime.document.getElementById('cookie-consent-banner');
  assert.equal(runtime.localStorage.getItem('consentMode'), null, 'malformed storage should be cleared');
  assert.equal(banner.hidden, false, 'banner should show when storage is invalid');
}

function testSetConsentPersistsEnvelope() {
  const runtime = createRuntime();
  runtime.window.cookieconsent.setConsent({
    necessary: true,
    analytics: true,
    preferences: false,
    marketing: true,
    partners: false
  });

  const stored = parsedConsent(runtime);
  assert.ok(stored, 'consent should be persisted');
  assert.equal(stored.schemaVersion, 1);
  assert.equal(stored.source, 'user_action');
  assert.equal(stored.selection.analytics, true);
  assert.equal(stored.selection.preferences, false);
  assert.equal(stored.consentMode.ad_storage, 'granted');
  assert.equal(stored.consentMode.personalization_storage, 'denied');
  assert.equal(runtime.window.cookieconsent.consentMode.ad_storage, 'granted');
  assert.ok(gtagCalls(runtime, 'consent').some((entry) => entry[1] === 'update' && entry[2].ad_storage === 'granted'), 'consent update should be emitted');
}

function testShowHideFocusRestoration() {
  const runtime = createRuntime();
  const opener = new FakeButtonElement(runtime.document, 'button', 'demo-opener');
  runtime.document.activeElement = opener;

  runtime.window.cookieconsent.show();
  assert.equal(runtime.document.activeElement.id, 'cookie-consent-btn-accept-all', 'show() should focus the first action');

  runtime.window.cookieconsent.hide();
  assert.equal(runtime.document.activeElement, opener, 'hide() should restore the previously focused element');
}

const tests = [
  ['fresh boot', testFreshBoot],
  ['legacy migration', testLegacyMigration],
  ['malformed storage', testMalformedStorageClears],
  ['setConsent persistence', testSetConsentPersistsEnvelope],
  ['focus restoration', testShowHideFocusRestoration]
];

let failures = 0;

for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}`);
    console.error(error && error.stack ? error.stack : error);
  }
}

if (failures > 0) {
  process.exitCode = 1;
  throw new Error(`${failures} runtime test(s) failed`);
}

console.log(`Runtime tests passed (${tests.length}).`);
