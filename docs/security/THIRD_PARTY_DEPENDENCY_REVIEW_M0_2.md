# KORA+ — Revue supply-chain M0.2

Date : 2026-08-13
Lot : M0.2 — Supply-chain Security Hotfix
Base : `79ceddc6cbf04b3d213001417da0841044af8206`

## Alerte postérieure à M0.1

Le gate M0.1 a été fusionné puis clôturé sur la base ci-dessus. Ses audits
étaient à zéro au moment de ses validations finales. La fiche GitHub
`GHSA-2v37-7h3g-55p8` existait déjà, mais sa définition a été actualisée le
2026-08-13 à 15:43:02 UTC, après le head et les checks finaux M0.1. Cette
actualisation a ajouté la branche Nano ID 3.x à la plage affectée :
`nanoid < 3.3.18`, avec `3.3.18` comme première version corrigée.

Les PR Dependabot ouvertes après la fusion M0.1 ont donc exposé le nouvel état
du registre npm : `npm audit` a commencé à signaler une vulnérabilité haute
transmise par `postcss@8.5.24`, qui dépend de `nanoid` avec une plage compatible.
La divergence entre la fiche GitHub et les audits M0.1 était temporelle : elle
ne constitue plus une contradiction dans l'état courant. La fiche GitHub et
`npm audit` convergent maintenant sur le seuil corrigé `3.3.18`.

Référence primaire : [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8).

## Correction minimale

Le dépôt conserve `postcss@8.5.24` et toutes ses dépendances directes. Seul
l'override racine passe de `nanoid@3.3.17` à `nanoid@3.3.18`, version minimale
corrigée de la ligne 3.x. Le lockfile ne change que les trois métadonnées de
`node_modules/nanoid` : version, URL de tarball et intégrité.

Cette option est plus prudente qu'une mise à jour plus large : elle ferme
l'avis sans modifier `postcss`, Next.js, Vite, les manifestes de workspace ou
la topologie du graphe npm. Nano ID reste sous licence MIT, depuis le registre
npm officiel, sans nouveau script d'installation ni nouvelle dépendance.

## Traitement des PR Dependabot #14 à #16

| PR  | Proposition                                             | État final         | Preuve Security et décision                                                                                                                                                              |
| --- | ------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #14 | `tldts-core` 7.4.9 → 7.4.10 dans le lockfile uniquement | Fermée sans fusion | Run `31723111543` rouge sur Nano ID. La PR prouve que l'intention direct-only M0.1 n'était pas effectivement imposée : une transitive a été proposée faute de `dependency-type: direct`. |
| #15 | `go_router` 17.3.0 → 17.5.0                             | Fermée sans fusion | Run `31723141518` rouge sur Nano ID. La mise à jour courante est reportée hors du hotfix.                                                                                                |
| #16 | `@testing-library/jest-dom` 7.0.0 → 7.0.1               | Fermée sans fusion | Run `31723160902` rouge sur Nano ID. La mise à jour courante est reportée hors du hotfix.                                                                                                |

Chaque PR a reçu un commentaire de traçabilité propre avant sa fermeture.
Aucune n'a été fusionnée et aucune commande de suppression de branche n'a été
exécutée. Les trois références et leurs SHAs ont été capturés avant fermeture ;
le `git fetch --prune` final a ensuite constaté leur suppression automatique
par Dependabot. Elles n'ont pas été recréées et aucun paramètre GitHub n'a été
modifié.

## Politique Dependabot renforcée

Les blocs npm et Pub conservent une cadence hebdomadaire, cinq PR ouvertes au
maximum et une unique règle `allow`. Cette règle exige désormais à la fois :

- `dependency-name: "*"` ;
- `dependency-type: direct` ;
- uniquement `version-update:semver-patch` et
  `version-update:semver-minor`.

Le scanner du dépôt contrôle déterministement les deux écosystèmes, leurs
répertoires, leur cadence, leur règle directe, les deux niveaux SemVer permis,
l'absence d'écosystème supplémentaire et l'absence de configuration
d'auto-merge. Les tests négatifs reproduisent notamment l'omission npm révélée
par la PR #14, l'omission Pub, l'autorisation d'une major et l'auto-merge.

Selon la documentation GitHub, `update-types` limite les version updates et ne
filtre pas les security updates. Les alertes et mises à jour de sécurité ne
sont ni désactivées ni masquées. Les majors restent soumises à un lot de
migration explicitement autorisé.

Référence : [Dependabot options reference](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference).

## Preuve négative et positive

Sur la base M0.1 intacte, Node `22.18.0` et npm `10.9.3` résolvaient
`postcss@8.5.24 -> nanoid@3.3.17`. La commande
`npm audit --audit-level=high` échouait avec un code non nul sur
`GHSA-2v37-7h3g-55p8`.

Après la régénération ciblée du lockfile, le même graphe résout
`postcss@8.5.24 -> nanoid@3.3.18`. Les audits complet et production au niveau
`low` retournent zéro vulnérabilité. L'état négatif n'a jamais été enregistré
sur la branche : il a été observé avant toute mutation du manifeste ou du
lockfile.

M0.2 est un hotfix supply-chain de maintenance. S0.6 et Slice 1 ne sont pas
commencés.
