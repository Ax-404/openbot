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

- Configuration `updates.enabled: false` dans `apps/mobile/app.json`
- Aucune mise à jour JavaScript ne sera téléchargée depuis l'amont

## Auto-update amont coupé

L'instance ne télécharge jamais de binaire depuis le dépôt amont `nightly-labs/openbot`.

## NEAR Intents désactivé

Le coffre NEAR Intents est désactivé directement dans le code :

- `src/main/near-intents-gateway.ts` retourne toujours une liste d'owners vide
- Aucune opération NEAR Intents ne peut être effectuée

## Plugins retirés du catalogue

Les plugins suivants sont retirés du catalogue :

- **Coinbase** : supprimé de `marketplace/plugin-catalog/plugins/` et `resources/plugin-catalog/`
- **Robinhood** : supprimé de `marketplace/plugin-catalog/plugins/` et `resources/plugin-catalog/`

## Garde-fou CI obligatoire

Un script de contrôle déterministe (`scripts/fork-privacy-guard.ts`) vérifie à chaque PR et push sur `main` :

- Absence des endpoints `analytics.openbot.run` et `updates.openbot.run`
- Absence de références auto-update vers `nightly-labs/openbot`
- Absence des répertoires plugins Coinbase et Robinhood
- Désactivation effective de NEAR Intents

Le workflow `.github/workflows/fork-privacy-guard.yml` fait échouer la CI si une violation est détectée.

## Builds hors serveur

Le workflow `.github/workflows/fork-build.yml` permet de construire l'image Docker localement ou via GitHub Actions, avec publication sur GHCR (`ghcr.io/${{ github.repository }}`).

## Politique de synchro amont

- Les merges depuis l'amont (`nightly-labs/openbot`) doivent être revus manuellement
- Le garde-fou CI vérifie que la télémétrie et les éléments interdits ne sont pas réintroduits
- Toute PR doit passer les contrôles de confidentialité avant fusion

## Revue et fusion manuelles

- Aucune auto-fusion (auto-merge) n'est activée
- Toute fusion requiert une revue manuelle pour vérifier la conformité
