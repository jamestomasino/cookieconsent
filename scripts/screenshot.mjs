import { chromium } from 'playwright';

const root = process.cwd();
const port = 4173;
const url = `http://127.0.0.1:${port}`;

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
];

async function screenshotNormal() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: viewports[0],
    locale: 'en-US',
  });
  const page = await context.newPage();
  await page.goto(url);
  await page.waitForSelector('#cookie-consent-banner', { state: 'visible' });
  await page.screenshot({ path: `${root}/sample.png`, fullPage: false });
  await browser.close();
  console.log('  ✓ sample.png');
}

async function screenshotGPC() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: viewports[0],
    locale: 'en-US',
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'globalPrivacyControl', {
      get: () => true,
      configurable: true,
    });
  });
  await page.goto(url);
  await page.waitForSelector('#gpc-notice', { state: 'visible' });
  await page.screenshot({ path: `${root}/sample-gpc.png`, fullPage: false });
  await browser.close();
  console.log('  ✓ sample-gpc.png');
}

async function screenshotDNT() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: viewports[0],
    locale: 'en-US',
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'doNotTrack', {
      get: () => '1',
      configurable: true,
    });
  });
  await page.goto(url);
  await page.waitForSelector('#dnt-notice', { state: 'visible' });
  await page.screenshot({ path: `${root}/sample-dnt.png`, fullPage: false });
  await browser.close();
  console.log('  ✓ sample-dnt.png');
}

async function screenshotMobile() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    locale: 'en-US',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
  });
  const page = await context.newPage();
  await page.goto(url);
  await page.waitForSelector('#cookie-consent-banner', { state: 'visible' });
  await page.screenshot({ path: `${root}/sample-mobile.png`, fullPage: false });
  await browser.close();
  console.log('  ✓ sample-mobile.png');
}

(async () => {
  console.log('Generating screenshots...');
  await screenshotNormal();
  await screenshotGPC();
  await screenshotDNT();
  await screenshotMobile();
  console.log('Done.');
})();
