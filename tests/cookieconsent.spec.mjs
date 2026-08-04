import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/gtm.js**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: 'window.__gtmStubLoaded = true;'
    });
  });
});

test('boots with a region-scoped default and shows the banner', async ({ page }) => {
  await page.goto('/');

  const banner = page.locator('#cookie-consent-banner');
  const acceptAllButton = page.locator('#cookie-consent-btn-accept-all');

  await expect(banner).toBeVisible();
  await expect(acceptAllButton).toBeFocused();

  const bootState = await page.evaluate(() => {
    const defaults = window.dataLayer.filter((entry) => entry[0] === 'consent' && entry[1] === 'default');
    const updates = window.dataLayer.filter((entry) => entry[0] === 'consent' && entry[1] === 'update');
    return {
      defaults,
      updates,
      gtmInjected: !!document.querySelector('script[data-gtm-loader]'),
      gtmLoaded: window.__gtmStubLoaded === true
    };
  });

  expect(bootState.gtmInjected).toBe(true);
  expect(bootState.gtmLoaded).toBe(true);
  expect(bootState.defaults).toHaveLength(1);
  expect(bootState.defaults[0][2]).toMatchObject({
    region: expect.any(Array),
    ad_storage: 'denied',
    analytics_storage: 'denied'
  });
  expect(bootState.updates).toHaveLength(0);
});

test('accept all persists the versioned envelope and hides the banner', async ({ page }) => {
  await page.goto('/');

  await page.locator('#cookie-consent-btn-accept-all').click();

  await expect(page.locator('#cookie-consent-banner')).toBeHidden();

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('consentMode')));
  expect(stored).toMatchObject({
    schemaVersion: 1,
    source: 'user_action',
    selection: {
      necessary: true,
      analytics: true,
      preferences: true,
      marketing: true,
      partners: true
    },
    consentMode: {
      ad_storage: 'granted',
      analytics_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
      functionality_storage: 'granted',
      personalization_storage: 'granted',
      security_storage: 'granted'
    }
  });
  expect(stored.createdAt).toBeTruthy();
  expect(stored.updatedAt).toBeTruthy();
  expect(stored.expiresAt).toBeTruthy();
});

test('legacy raw storage migrates to the envelope', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('consentMode', JSON.stringify({
      ad_storage: 'granted',
      analytics_storage: 'denied',
      ad_user_data: 'granted',
      ad_personalization: 'denied',
      functionality_storage: 'granted',
      personalization_storage: 'denied',
      security_storage: 'granted'
    }));
  });

  await page.goto('/');

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('consentMode')));
  expect(stored).toMatchObject({
    schemaVersion: 1,
    source: 'migration',
    consentMode: {
      ad_storage: 'granted',
      analytics_storage: 'denied',
      ad_user_data: 'granted',
      ad_personalization: 'denied',
      functionality_storage: 'granted',
      personalization_storage: 'denied',
      security_storage: 'granted'
    }
  });
  await expect(page.locator('#cookie-consent-banner')).toBeHidden();
});

test('malformed storage is cleared and the banner remains usable', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('consentMode', '{bad-json');
  });

  await page.goto('/');

  await expect(page.locator('#cookie-consent-banner')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('consentMode'))).toBeNull();
});

test('public show and hide restore focus', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem('consentMode');
  });

  await page.goto('/');
  await page.locator('#open-banner').click();
  await expect(page.locator('#cookie-consent-btn-accept-all')).toBeFocused();

  await page.evaluate(() => window.cookieconsent.hide());
  await expect(page.locator('#open-banner')).toBeFocused();

  await page.evaluate(() => window.cookieconsent.show());
  await expect(page.locator('#cookie-consent-btn-accept-all')).toBeFocused();
});

test('reopening the banner reflects stored consent state', async ({ page }) => {
  await page.goto('/');
  await page.locator('#cookie-consent-btn-accept-some').click();

  await page.evaluate(() => window.cookieconsent.show());

  const checked = await page.evaluate(() => ({
    analytics: document.getElementById('consent-analytics').checked,
    preferences: document.getElementById('consent-preferences').checked,
    marketing: document.getElementById('consent-marketing').checked,
    partners: document.getElementById('consent-partners').checked
  }));

  expect(checked).toEqual({
    analytics: true,
    preferences: true,
    marketing: true,
    partners: false
  });
});

test('GPC signal shows notice, locks toggles, and denies all data collection', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'globalPrivacyControl', {
      get: () => true,
      configurable: true
    });
  });
  await page.goto('/');

  const banner = page.locator('#cookie-consent-banner');
  const gpcNotice = page.locator('#gpc-notice');

  // Banner is visible with GPC notice shown
  await expect(banner).toBeVisible();
  await expect(gpcNotice).toBeVisible();

  // API reports GPC active
  const gpcActive = await page.evaluate(() => window.cookieconsent.gpcActive);
  expect(gpcActive).toBe(true);

  // Non-necessary checkboxes are unchecked and disabled (GPC-locked)
  const toggles = await page.evaluate(() => {
    const ids = ['consent-analytics', 'consent-marketing', 'consent-preferences', 'consent-partners'];
    return ids.map((id) => ({
      id,
      checked: document.getElementById(id).checked,
      disabled: document.getElementById(id).disabled,
      gpcLocked: document.getElementById(id).getAttribute('data-privacy-locked')
    }));
  });

  for (const toggle of toggles) {
    expect(toggle.checked).toBe(false);
    expect(toggle.disabled).toBe(true);
    expect(toggle.gpcLocked).toBe('true');
  }

  // Accept All and Accept Selection buttons are hidden
  await expect(page.locator('#cookie-consent-btn-accept-all')).toBeHidden();
  await expect(page.locator('#cookie-consent-btn-accept-some')).toBeHidden();

  // Close button remains visible for dismissal
  const closeBtn = page.locator('#cookie-consent-btn-reject-all');
  await expect(closeBtn).toBeVisible();
  await expect(closeBtn).toHaveText('Close');

  // GPC notice is visible (outside the fieldset, between it and buttons)
  await expect(page.locator('#gpc-notice')).toBeVisible();

  // Fieldset is hidden (GPC notice replaces it visually)
  const fieldsetHidden = await page.evaluate(() => {
    return document.querySelector('.cookie-consent-options').hasAttribute('hidden');
  });
  expect(fieldsetHidden).toBe(true);

  // Consent mode defaults remain denied
  const consentDefaults = await page.evaluate(() => {
    return window.dataLayer.filter((entry) => entry[0] === 'consent' && entry[1] === 'default');
  });
  expect(consentDefaults).toHaveLength(1);
  expect(consentDefaults[0][2]).toMatchObject({
    ad_storage: 'denied',
    analytics_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied'
  });
});

test('GPC user can close banner with Close and consent persists as denied', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'globalPrivacyControl', {
      get: () => true,
      configurable: true
    });
  });
  await page.goto('/');

  await expect(page.locator('#gpc-notice')).toBeVisible();

  // User clicks Close to close
  await page.locator('#cookie-consent-btn-reject-all').click();

  await expect(page.locator('#cookie-consent-banner')).toBeHidden();

  // Stored consent is all denied (except necessary storage)
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('consentMode')));
  expect(stored.consentMode).toMatchObject({
    ad_storage: 'denied',
    analytics_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    functionality_storage: 'granted',
    personalization_storage: 'denied',
    security_storage: 'granted'
  });
  expect(stored.source).toBe('user_action');
});

test('GPC banner does not reappear on reload after Close', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'globalPrivacyControl', {
      get: () => true,
      configurable: true,
    });
  });
  await page.goto('/');

  // Dismiss with Close
  await page.locator('#cookie-consent-btn-reject-all').click();
  await expect(page.locator('#cookie-consent-banner')).toBeHidden();

  // Reload — banner should stay hidden (stored consent prevents it)
  await page.reload();
  await expect(page.locator('#cookie-consent-banner')).toBeHidden();
});

test('DNT banner does not reappear on reload after Close', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'doNotTrack', {
      get: () => '1',
      configurable: true,
    });
  });
  await page.goto('/');

  // Dismiss with Close
  await page.locator('#cookie-consent-btn-reject-all').click();
  await expect(page.locator('#cookie-consent-banner')).toBeHidden();

  // Reload — banner should stay hidden (stored consent prevents it)
  await page.reload();
  await expect(page.locator('#cookie-consent-banner')).toBeHidden();
});

test('DNT signal shows notice, locks toggles, and denies all data collection', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'doNotTrack', {
      get: () => '1',
      configurable: true
    });
  });
  await page.goto('/');

  const banner = page.locator('#cookie-consent-banner');
  const dntNotice = page.locator('#dnt-notice');

  // Banner is visible with DNT notice shown
  await expect(banner).toBeVisible();
  await expect(dntNotice).toBeVisible();

  // API reports DNT active
  const dntActive = await page.evaluate(() => window.cookieconsent.dntActive);
  expect(dntActive).toBe(true);

  // GPC notice should NOT be visible (only DNT)
  await expect(page.locator('#gpc-notice')).toBeHidden();

  // Non-necessary checkboxes are unchecked and disabled
  const toggles = await page.evaluate(() => {
    const ids = ['consent-analytics', 'consent-marketing', 'consent-preferences', 'consent-partners'];
    return ids.map((id) => ({
      id,
      checked: document.getElementById(id).checked,
      disabled: document.getElementById(id).disabled
    }));
  });

  for (const toggle of toggles) {
    expect(toggle.checked).toBe(false);
    expect(toggle.disabled).toBe(true);
  }

  // Accept All and Accept Selection buttons are hidden
  await expect(page.locator('#cookie-consent-btn-accept-all')).toBeHidden();
  await expect(page.locator('#cookie-consent-btn-accept-some')).toBeHidden();

  // Close button remains visible for dismissal
  const closeBtn = page.locator('#cookie-consent-btn-reject-all');
  await expect(closeBtn).toBeVisible();
  await expect(closeBtn).toHaveText('Close');

  // Fieldset is hidden (DNT notice replaces it visually)
  const fieldsetHidden = await page.evaluate(() => {
    return document.querySelector('.cookie-consent-options').hasAttribute('hidden');
  });
  expect(fieldsetHidden).toBe(true);
});

test('DNT user can close banner with Close and consent persists as denied', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'doNotTrack', {
      get: () => '1',
      configurable: true
    });
  });
  await page.goto('/');

  await expect(page.locator('#dnt-notice')).toBeVisible();

  // User clicks Close to close
  await page.locator('#cookie-consent-btn-reject-all').click();

  await expect(page.locator('#cookie-consent-banner')).toBeHidden();

  // Stored consent is all denied (except necessary storage)
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('consentMode')));
  expect(stored.consentMode).toMatchObject({
    ad_storage: 'denied',
    analytics_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    functionality_storage: 'granted',
    personalization_storage: 'denied',
    security_storage: 'granted'
  });
  expect(stored.source).toBe('user_action');
});
