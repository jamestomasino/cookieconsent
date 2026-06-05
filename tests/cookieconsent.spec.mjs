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
  const rejectButton = page.locator('#cookie-consent-btn-reject-all');

  await expect(banner).toBeVisible();
  await expect(rejectButton).toBeFocused();

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
  await expect(page.locator('#cookie-consent-btn-reject-all')).toBeFocused();

  await page.evaluate(() => window.cookieconsent.hide());
  await expect(page.locator('#open-banner')).toBeFocused();

  await page.evaluate(() => window.cookieconsent.show());
  await expect(page.locator('#cookie-consent-btn-reject-all')).toBeFocused();
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
