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

## Traitement des PR Dependabot #14 à #21

| PR  | Catégorie  | Proposition                                          | Head capturé                               | Run Security  | Décision                |
| --- | ---------- | ---------------------------------------------------- | ------------------------------------------ | ------------- | ----------------------- |
| #14 | Transitive | `tldts-core` 7.4.9 → 7.4.10, lockfile uniquement     | `f677ea32a29279f7e54d6dff0bb326d40acc4505` | `31723111543` | Fermée sans fusion      |
| #15 | Directe    | `go_router` 17.3.0 → 17.5.0                          | `6ec1c60bc7e872d67df35d1669b75eef2bc08c8c` | `31723141518` | Reportée, non fusionnée |
| #16 | Directe    | `@testing-library/jest-dom` 7.0.0 → 7.0.1            | `9ddb5b33b35128cdfcbda89e7032c9e1d820ed59` | `31723160902` | Reportée, non fusionnée |
| #17 | Transitive | `axe-core` 4.12.1 → 4.13.0, lockfile uniquement      | `b21890d3d9fef7d627d44e65f25a56d398874258` | `31723210705` | Fermée sans fusion      |
| #18 | Transitive | `tinyexec` 1.2.4 → 1.3.0, lockfile uniquement        | `a8230414027c6ae21f0163c6cd45c2712f33c845` | `31723227890` | Fermée sans fusion      |
| #19 | Transitive | `flatted` 3.4.3 → 3.4.4, lockfile uniquement         | `793877e662425abb2df87561a105fe4235922798` | `31723293695` | Fermée sans fusion      |
| #20 | Transitive | `caniuse-lite` 1.0.30001806 → 1.0.30001809, lockfile | `34a65ca967418cd1804ed3e973cc041ee6109d98` | `31750552893` | Fermée sans fusion      |
| #21 | Directe    | `eslint-config-next` 16.2.12 → 16.3.0                | `a9a6009e673209802d551432c06dc1f118fa1f54` | `31750573809` | Reportée, non fusionnée |

Les huit runs Security étaient rouges sur la vulnérabilité Nano ID héritée de
l'ancienne base. #14, #17, #18, #19 et #20 démontrent des propositions
transitives antérieures à l'application effective de la politique direct-only ;
elles ne sont ni retenues ni réappliquées automatiquement ou manuellement dans
M0.2. Les mises à jour directes #15, #16 et #21 sont reportées hors du hotfix,
vers un futur lot de maintenance explicitement autorisé.

#20 et #21 ont été ouvertes respectivement à 22:35:08 UTC et 22:35:25 UTC,
avant la publication de la Draft PR #22 à 22:43:58 UTC. Elles utilisaient encore
la configuration présente sur `main`, pas la politique portée par #22.

Chaque PR a reçu un commentaire de traçabilité propre avant sa fermeture.
Aucune n'a été fusionnée et aucune commande de suppression de branche n'a été
exécutée. Dependabot avait automatiquement supprimé les références #14 à #18
et #21 avant le commit R1 ; les références #19 et #20 existaient encore au
constat final pré-commit. Elles n'ont pas été recréées et aucun paramètre GitHub
n'a été modifié.

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
