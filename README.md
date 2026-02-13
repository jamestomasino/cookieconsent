# Cookie Consent Mode V2 For Google Tags

This repository is a straight forward dependency-free implementation of a cookie
consent banner which sends its data onward to Google Tag Manager using Google's
new Consent Mode V2. This implementation also respects DoNotTrack and
GlobalPrivacyControl signals when set.

## Implementation

1. Add the `cookieconsent.js` to your site's HEAD tag. Be sure it is placed
   before your Google Tag Manager script and it is not deferred. This file must
   run before GTM is loaded.
2. Choose your default strategy in `cookieconsent.js`:
   - Set `USE_REGION_LIST = true` and update `CONSENT_REGION_LIST` to target only
     regulated regions (higher data retention, needs maintenance as laws change).
   - Set `USE_REGION_LIST = false` for a global conservative default (lowest
     maintenance, more data loss).
2. Add the `cookieconsent.css` file to your site where appropriate. Feel free to
   edit the styles to match your site look and feel.
3. Add an element somewhere on your side with the class name
   `cookie-consent-banner-open`. This element will re-open the consent banner and
   allow users to change their choices. Alternatively, you can call the global
   function `window.cookieconsent.show()` to launch the banner.
4. In GTM, enable Consent Mode.
5. Check the Consent Mode settings against your tags to be sure they are
   appropriately aligned.

Tip: *View the index.html for a working example.*

![Sample of the Cookie Banner](sample.png)
