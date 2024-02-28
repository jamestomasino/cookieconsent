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
window.dataLayer = window.dataLayer || [];
function gtag() { dataLayer.push(arguments); }

if (localStorage.getItem('consentMode') === null) {
  gtag('consent', 'default', {
    'functionality_storage': 'denied',
    'security_storage': 'denied',
    'ad_storage': 'denied',
    'ad_user_data': 'denied',
    'ad_personalization': 'denied',
    'analytics_storage': 'denied',
    'personalization_storage': 'denied',
    'wait_for_update': 500,
  });
} else {
  gtag('consent', 'default', JSON.parse(localStorage.getItem('consentMode')));
}

window.onload = function() {
  const cookie_consent_banner_dom = `
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
  `

  document.body.insertAdjacentHTML('beforeend', cookie_consent_banner_dom)
  const cookie_consent_banner = document.body.lastElementChild

  function dnt () {
    return (navigator.doNotTrack == "1" || window.doNotTrack == "1")
  }

  function gpc () {
    return (navigator.globalPrivacyControl || window.globalPrivacyControl)
  }

  function showBanner() {
    const cm = JSON.parse(window.localStorage.getItem('consentMode'))
    if (cm && cm.functionality_storage) {
      if (cm.functionality_storage == 'granted') {
        document.querySelector('#consent-necessary').checked = true
        document.querySelector('#consent-necessary').disabled = true
      } else {
        document.querySelector('#consent-necessary').checked = false
        document.querySelector('#consent-necessary').disabled = false
      }
      document.querySelector('#consent-analytics').checked = (cm.analytics_storage == 'granted') ? true : false
      document.querySelector('#consent-preferences').checked = (cm.ad_personalization == 'granted') ? true : false
      document.querySelector('#consent-marketing').checked = (cm.ad_storage == 'granted') ? true : false
      document.querySelector('#consent-partners').checked = (cm.ad_personalization == 'granted') ? true : false
    }
    cookie_consent_banner.style.display = 'flex';
  }

  function hideBanner() {
    cookie_consent_banner.style.display = 'none';
  }

  window.cookieconsent = {
    show: showBanner,
    hide: hideBanner
  }

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
    window.cookieconsent.consentMode = consentMode
    gtag('consent', 'update', consentMode);
    localStorage.setItem('consentMode', JSON.stringify(consentMode));
  }

  if (cookie_consent_banner) {
    Array.from(document.querySelectorAll('.cookie-consent-banner-open')).map(btn => {
      btn.addEventListener('click', () => {
        showBanner()
      })
    })

    if (window.localStorage.getItem('consentMode')) {
      hideBanner()
    } else {
      showBanner()
    }

    cookie_consent_banner.querySelector('#cookie-consent-btn-accept-all').addEventListener('click', () => {
      setConsent({
        necessary: true,
        analytics: true,
        preferences: true,
        marketing: true,
        partners: true
      });
      hideBanner();
    });
    cookie_consent_banner.querySelector('#cookie-consent-btn-accept-some').addEventListener('click', () => {
      setConsent({
        necessary: true,
        analytics: document.querySelector('#consent-analytics').checked,
        preferences: document.querySelector('#consent-preferences').checked,
        marketing: document.querySelector('#consent-marketing').checked,
        partners: document.querySelector('#consent-partners').checked
      });
      hideBanner();
    });
    cookie_consent_banner.querySelector('#cookie-consent-btn-reject-all').addEventListener('click', () => {
      setConsent({
        necessary: true,
        analytics: false,
        preferences: false,
        marketing: false,
        partners: false
      });
      hideBanner();
    });
  }
}
