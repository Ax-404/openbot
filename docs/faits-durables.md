# Faits durables de ce fork

Ce document liste les décisions techniques permanentes, interdits et conventions appliqués à ce fork.

## Neutralisation de la télémétrie

La télémétrie et les analytics sont désactivés sur toutes les surfaces :

- **Desktop (main/renderer)** : transport OpenPanel neutralisé (no-op dans `packages/telemetry/src/transport.ts`)
- **Mobile** : client analytics désactivé (retourne `null` dans `mobile-analytics.ts`)
- **Extension navigateur** : fonctions analytics neutralisées (no-op dans `analytics.ts`)
- **CSP** : endpoint `analytics.openbot.run` retiré de la politique de sécurité du contenu

## Mises à jour OTA désactivées

Les mises à jour over-the-air mobiles pointant vers `updates.openbot.run` sont désactivées :

- Configuration `updates.enabled: false`, `checkAutomatically: "NEVER"` et `fallbackToCacheTimeout: 0` dans `apps/mobile/app.json`
- Aucune mise à jour JavaScript ne sera téléchargée depuis l'amont

## Auto-update et publication amont coupés

L'instance ne télécharge jamais de binaire depuis le dépôt amont `nightly-labs/openbot` :

- `src/main/host-release-service.ts` et `src/main/download-url.ts` neutralisent les vérifications et liens vers les releases amont
- `electron-builder.yml` définit explicitement `publish: null` à la place de la cible GitHub amont (`nightly-labs/openbot`), ce qui empêche `electron-builder` de retomber sur `package.json#repository` et de générer un `app-update.yml` pointant vers l'amont
- Les workflows de release amont `.github/workflows/release.yml` (Release desktop) et `.github/workflows/release-extension.yml` (Release browser extension) sont gardés par `github.repository == 'nightly-labs/openbot'` afin de ne jamais s'exécuter ni publier sur le fork (y compris lors d'un push de tag `v*`)

## NEAR Intents désactivé

Le coffre NEAR Intents est désactivé directement dans le code :

- `src/main/near-intents-gateway.ts` retourne toujours une liste d'owners vide
- Aucune opération NEAR Intents ne peut être effectuée

## Plugins retirés du catalogue

Les plugins suivants sont retirés du catalogue :

- **Coinbase** : supprimé de `marketplace/plugin-catalog/plugins/`, `resources/plugin-catalog/` et des catalogues générés
- **Robinhood** : supprimé de `marketplace/plugin-catalog/plugins/`, `resources/plugin-catalog/` et des catalogues générés

## Garde-fou CI obligatoire

Un script de contrôle déterministe (`scripts/fork-privacy-guard.ts`) vérifie à chaque PR et push sur `main` :

- Absence des endpoints `analytics.openbot.run` et `updates.openbot.run` (exception limitée à `apps/mobile/app.json` uniquement si `expo.updates.enabled === false`)
- Absence de références auto-update vers `nightly-labs/openbot`
- Neutralisation de `electron-builder.yml` (`publish: null` explicite et aucune référence `nightly-labs`, fail-closed)
- Absence des répertoires et entrées générées des plugins Coinbase et Robinhood
- Désactivation effective de NEAR Intents (fail-closed)
- Désactivation effective de l'OTA mobile (fail-closed)

Le workflow `.github/workflows/fork-privacy-guard.yml` fait échouer la CI si une violation est détectée.

## Builds hors serveur

Le workflow `.github/workflows/fork-build.yml` construit l'AppImage Linux puis l'image Docker, avec publication sur GHCR (`ghcr.io/${{ github.repository }}`).

## Politique de synchro amont

- Les merges depuis l'amont (`nightly-labs/openbot`) doivent être revus manuellement
- Le garde-fou CI vérifie que la télémétrie et les éléments interdits ne sont pas réintroduits
- Toute PR doit passer les contrôles de confidentialité avant fusion

## Revue et fusion manuelles

- Aucune auto-fusion (auto-merge) n'est activée
- Toute fusion requiert une revue manuelle pour vérifier la conformité
