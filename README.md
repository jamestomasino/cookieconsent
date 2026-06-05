# Cookie Consent Mode V2 For Google Tags
[![CalVer 2026.02.27](https://img.shields.io/badge/CalVer-2026.02.27-0A66C2)](#)

Dependency-free consent banner that integrates with Google Consent Mode V2 and can optionally load GTM after consent defaults are in place.

What it does:
- Initializes conservative Consent Mode defaults before tags run.
- Persists user choices in `localStorage` with a versioned envelope.
- Applies stored consent on subsequent visits.
- Ignores malformed, expired, or legacy consent storage safely.
- Supports Do Not Track (`navigator.doNotTrack`) and Global Privacy Control (`navigator.globalPrivacyControl`).
- Exposes a small public API (`window.cookieconsent`).
- Supports optional region-scoped default consent behavior.
- Loads GTM automatically after consent boot when `gtmId` is configured.
- Skips GTM loading when no GTM ID is configured.

What it is not:
- Not a full CMP.
- Does not provide IAB TCF strings, vendor lists, consent records, preference-center versioning, scan-based cookie categorization, or proof-of-consent workflows.

## Quick Start

1. Include `cookieconsent.css`.
2. Define `window.cookieconsentConfig = { gtmId: 'GTM-XXXXXXX' }` **before** `cookieconsent.js`.
3. Include `cookieconsent.js` in `<head>` (not deferred).
4. Add a `.cookie-consent-banner-open` element anywhere in the page.
5. Enable Consent Mode in GTM and align tag consent requirements.

Minimal example:

```html
<link rel="stylesheet" href="cookieconsent.css" />
<script>
  window.cookieconsentConfig = {
    gtmId: 'GTM-XXXXXXX'
  };
</script>
<script src="cookieconsent.js"></script>
```

## Load Order

Recommended order in `<head>`:
1. `cookieconsent.css`
2. `window.cookieconsentConfig = { gtmId: ... }`
3. `cookieconsent.js`
4. Other analytics/marketing scripts only if they are also consent-aware

Why: this ensures consent defaults are available before GTM or other tags execute.

## Region Configuration

In `cookieconsent.js`:
- `USE_REGION_LIST = false`: default-deny is applied globally.
- `USE_REGION_LIST = true`: default-deny is applied only to `CONSENT_REGION_LIST`.

Update `CONSENT_REGION_LIST` to match your legal/compliance policy.

## GTM Configuration

Set either:
- `window.cookieconsentConfig = { gtmId: 'GTM-XXXXXXX' }`
- `window.COOKIECONSENT_GTM_ID = 'GTM-XXXXXXX'`

`cookieconsent.js` loads GTM once consent defaults and any valid stored consent have been applied.
If neither value is set, GTM is not loaded by this script.

Important:
- Consent Mode still depends on GTM being configured correctly.
- Tags must be mapped to the right consent requirements inside GTM.

Copy/paste examples:

```html
<script>
  window.cookieconsentConfig = { gtmId: 'GTM-XXXXXXX' };
</script>
```

```html
<script>
  window.COOKIECONSENT_GTM_ID = 'GTM-XXXXXXX';
</script>
```

## Public API

`window.cookieconsent.show()`
- Opens the banner.

`window.cookieconsent.hide()`
- Hides the banner.

`window.cookieconsent.setConsent(selection)`
- Programmatically sets consent and persists it.

`selection` shape:

```js
{
  necessary: true,
  analytics: true | false,
  preferences: true | false,
  marketing: true | false,
  partners: true | false
}
```

## Consent Mapping

Selections are mapped to Google Consent Mode keys:
- `marketing` -> `ad_storage`, `ad_user_data`
- `analytics` -> `analytics_storage`
- `partners` -> `ad_personalization`
- `preferences` -> `personalization_storage`
- `necessary` -> `functionality_storage`, `security_storage`

DNT/GPC can force denial for related fields.

## Storage

Consent is saved in `localStorage['consentMode']` as a versioned envelope:

```js
{
  schemaVersion: 1,
  createdAt: "2026-06-05T00:00:00.000Z",
  updatedAt: "2026-06-05T00:00:00.000Z",
  source: "user_action",
  expiresAt: "2027-06-05T00:00:00.000Z",
  consentMode: {
    ad_storage: "denied",
    analytics_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    functionality_storage: "granted",
    personalization_storage: "denied",
    security_storage: "granted"
  },
  selection: {
    necessary: true,
    analytics: false,
    preferences: false,
    marketing: false,
    partners: false
  }
}
```

Legacy raw consent objects are migrated automatically when read.
Malformed or expired values are ignored and cleared.

You can optionally override storage retention with:

```html
<script>
  window.cookieconsentConfig = {
    gtmId: 'GTM-XXXXXXX',
    consentStorageMaxAgeDays: 365
  };
</script>
```

## Testing Checklist

1. Clear `localStorage['consentMode']` and reload.
2. Confirm the banner appears.
3. Test accept all, reject all, and custom selection flows.
4. Verify `localStorage['consentMode']` updates correctly.
5. Verify GTM loads after consent boot.
6. Verify reopening the banner with `.cookie-consent-banner-open`.
7. Confirm malformed storage is cleared instead of breaking startup.

## DevTools Verification

Quick checks in browser devtools:

```js
// Confirm stored consent state:
localStorage.getItem('consentMode')

// Confirm GTM script injected by cookieconsent.js:
document.querySelector('script[data-gtm-loader]')
```

## Common Mistakes

1. Loading `cookieconsent.js` after GTM or other trackers.
2. Defining GTM ID config after loading `cookieconsent.js`.
3. Forgetting to set either `window.cookieconsentConfig.gtmId` or `window.COOKIECONSENT_GTM_ID`.
4. Assuming the region list is legally complete without compliance review.
5. Assuming this project is a CMP.

## Troubleshooting

- Banner does not appear:
  - Check whether `localStorage['consentMode']` already exists.
  - Call `window.cookieconsent.show()` manually to verify rendering.
- GTM does not load:
  - Check console warning for missing GTM ID.
  - Confirm `window.cookieconsentConfig.gtmId` (or `window.COOKIECONSENT_GTM_ID`) is defined before `cookieconsent.js`.
  - Confirm no CSP rule blocks `https://www.googletagmanager.com`.

## Compliance Note

This implementation provides technical controls for consent signaling and regional scoping.
It is not legal advice. Validate region strategy, defaults, storage retention, and tagging behavior with legal/compliance stakeholders.

## License

MIT

Tip: `index.html` in this repo demonstrates the config-based flow.

![Sample of the Cookie Banner](sample.png)
