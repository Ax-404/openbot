### Changed

- Neutralized OpenPanel telemetry transport to no-op for this fork.
- Disabled mobile analytics client for this fork.
- Neutralized browser extension analytics for this fork.
- Removed analytics.openbot.run from Content Security Policy.
- Disabled mobile OTA updates for this fork.
- Disabled NEAR Intents gateway for this fork.
- Made Docker image source configurable via build argument.

### Removed

- Coinbase plugin from catalog.
- Robinhood plugin from catalog.

### Added

- Privacy guard script with unit tests to enforce fork privacy invariants.
- CI workflow fork-privacy-guard.yml to run privacy checks on PR and push.
- Build workflow fork-build.yml for Docker image on GHCR.
- Documentation docs/faits-durables.md listing durable fork decisions.
