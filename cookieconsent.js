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
  });
} else {
  gtag('consent', 'default', JSON.parse(localStorage.getItem('consentMode')));
}

window.onload = function() {
  const cookie_consent_banner_dom = `
    <div id="cookie-consent-banner" class="cookie-consent-banner">
        <h3>Cookie settings</h3>
        <p>We use cookies to provide you with the best possible experience. They also allow us to analyze user behavior in order to constantly improve the website for you.</p>
        <button id="cookie-consent-btn-accept-all" class="cookie-consent-button btn-success">Accept All</button>
        <button id="cookie-consent-btn-accept-some" class="cookie-consent-button btn-outline">Accept Selection</button>
        <button id="cookie-consent-btn-reject-all" class="cookie-consent-button btn-grayscale">Reject All</button>
        <div class="cookie-consent-options">
          <label><input id="consent-necessary" type="checkbox" value="Necessary" checked disabled>Necessary</label>
          <label><input id="consent-analytics" type="checkbox" value="Analytics" checked>Analytics</label>
          <label><input id="consent-preferences" type="checkbox" value="Preferences" checked>Preferences</label>
          <label><input id="consent-marketing" type="checkbox" value="Marketing" checked>Marketing</label>
          <label><input id="consent-partners" type="checkbox" value="Partners">Partners</label>
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
    cookie_consent_banner.style.display = 'block';
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
      'functionality_storage': consent.necessary ? 'granted' : 'denied',
      'security_storage': consent.necessary ? 'granted' : 'denied',
      'ad_storage': (consent.marketing && !dnt()) ? 'granted' : 'denied',
      'ad_user_data': (consent.marketing && !dnt()) ? 'granted' : 'denied',
      'ad_personalization': (consent.partners && !gpc()) ? 'granted' : 'denied',
      'analytics_storage': consent.analytics ? 'granted' : 'denied',
      'ad_personalization': consent.preferences ? 'granted' : 'denied',
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
        necessary: false,
        analytics: false,
        preferences: false,
        marketing: false,
        partners: false
      });
      hideBanner();
    });
  }
}
