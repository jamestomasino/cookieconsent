# Changelog

## Unreleased

- Planned for the `1.2.0` release.

## 1.1.0

- Initial focus on banner open now lands on "Accept All" (previously "Reject All").
- When GPC or DNT is active, the dismiss button is relabeled from "Reject All" to "Close".
- GPC/DNT banner respects stored consent and does not reappear on reload after dismissal.
- Added `scripts/screenshot.mjs` for regenerating README screenshots.

## 1.0.0

- Added versioned consent storage with migration and expiry handling.
- Added banner accessibility improvements and focus management.
- Reworked the demo page to show the config-based bootstrap flow.
- Added `npm test`, a repository verification script, and GitHub Actions CI.
- Relicensed the project to MIT.

## 0.1.0

- Initial public packaging version for the MIT-licensed repository.
