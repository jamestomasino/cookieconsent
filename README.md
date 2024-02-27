# Cookie Consent Mode V2 For Google Tags

This repository is a straight forward dependency-free implementation of a cookie
consent banner which sends its data onward to Google Tag Manager using Google's
new Consent Mode V2. This implementation also respects DoNotTrack and
GlobalPrivacyControl signals when set.

## Implementation

1. Add the `cookieconsent.js` to your site's HEAD tag. Be sure it is placed
   before your Google Tag Manager script and it is not deferred. This file must
   run before GTM is loaded.
2. Add the `cookieconsent.css` file to your site where appropriate. Feel free to
   edit the styles to match your site look and feel.
3. In GTM, enable Consent Mode.
4. Check the Consent Mode settings against your tags to be sure they are
   appropriately aligned.
