import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const readme = read('README.md');
const code = read('cookieconsent.js');
const license = read('LICENSE');
const smoke = read('smoke-test.html');
const indexHtml = read('index.html');
const packageJson = JSON.parse(read('package.json'));
const packageLock = JSON.parse(read('package-lock.json'));
const changelog = read('CHANGELOG.md');

assert(license.startsWith('MIT License'), 'LICENSE must be MIT');
assert(readme.includes('MIT'), 'README must mention MIT');
assert(packageJson.version === '1.1.0', 'package.json must be version 1.1.0');
assert(packageLock.version === '1.1.0', 'package-lock.json must be version 1.1.0');
assert(packageLock.packages && packageLock.packages[''].version === '1.1.0', 'package-lock root package must be version 1.1.0');
assert(readme.includes('SemVer 1.1.0'), 'README must advertise SemVer 1.1.0');
assert(readme.includes('schemaVersion: 1'), 'README must document versioned consent storage');
assert(readme.includes('Smoke Test'), 'README must document the smoke test page');
assert(changelog.includes('## 1.0.0'), 'CHANGELOG must include the 1.0.0 release section');
assert(code.includes('schemaVersion: CONSENT_STORAGE_SCHEMA_VERSION'), 'cookieconsent.js must build a versioned consent record');
assert(code.includes('persistConsentRecord('), 'cookieconsent.js must persist consent through the envelope helper');
assert(code.includes("safeLocalStorageRemove(CONSENT_STORAGE_KEY)"), 'cookieconsent.js must clear invalid stored consent');
assert(code.includes("gtag('consent', 'default'"), 'cookieconsent.js must set Consent Mode defaults');
assert(code.includes('USE_REGION_LIST'), 'cookieconsent.js must retain region-scoped boot logic');
assert(code.includes("window.cookieconsent = Object.assign"), 'cookieconsent.js must expose the public API');
assert(smoke.includes('Run smoke tests'), 'smoke-test.html must present a runnable smoke test UI');
assert(indexHtml.includes('window.cookieconsentConfig'), 'index.html must demonstrate config-based setup');

console.log('Verification passed.');
