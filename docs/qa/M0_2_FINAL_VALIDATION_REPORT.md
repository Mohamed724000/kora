# KORA+ — Rapport final de validation M0.2

Date : 2026-08-14
Lot : M0.2 — Supply-chain Security Hotfix
Base : `79ceddc6cbf04b3d213001417da0841044af8206`
Commit d'implémentation validé :
`5e637485701c2d4cd512f544eb46c08eeb9d6a7d`
Head technique et documentaire accepté avant R1 :
`b5cb2861cb029602978f0c44c5eb45ed6fd8e0a0`

Statut : **M0.2 techniquement validé ; réconciliation documentaire M0.2-R1
appliquée sur la Draft PR #22 et soumise aux quatre workflows du nouveau head
documentaire**.

Le commit R1 qui contient ce rapport n'est volontairement pas
auto-référencé. Son SHA exact et ses quatre runs sont portés par la PR #22 et
par le rapport CTO post-workflows.

## Périmètre livré

- override racine `nanoid` : `3.3.17` vers `3.3.18` ;
- `package-lock.json` régénéré avec Node 22.18.0 et npm 10.9.3 ;
- politique Dependabot npm et Pub rendue explicitement direct-only ;
- gate déterministe et tests négatifs direct + patch/minor ;
- revue supply-chain M0.2, erratum M0.1 et Decision Log ;
- fermeture documentée, sans fusion, des PR #14 à #21.

Aucune fonctionnalité, UI, route, contrat, schéma, infrastructure, dépendance
directe ou version hors Nano ID n'a changé. S0.6 et Slice 1 ne sont pas
commencés.

## Preuve de graphe npm minimal

La comparaison structurée entre la base et le candidat compte 1 231 entrées
`packages` avant et après. Une seule entrée diffère :
`node_modules/nanoid`, de `3.3.17` à `3.3.18`.

- `postcss` reste `8.5.24` ;
- sa contrainte `nanoid: ^3.3.16` reste identique ;
- aucune entrée n'est ajoutée ou supprimée ;
- SHA-256 final de `package-lock.json` :
  `54448CA65A03D32F590733D9F6C4E189E9A6455884EFB46923850F9060672492`.

Le hash reste identique après `npm ci` et après une seconde commande
`npm update nanoid --package-lock-only --ignore-scripts`.

## Audit négatif et positif

Avant toute mutation du manifeste ou du lockfile, la base intacte résolvait
`postcss@8.5.24 -> nanoid@3.3.17`. `npm audit --audit-level=high` a échoué avec
un code non nul sur `GHSA-2v37-7h3g-55p8`, sévérité haute.

Après correction, `npm ls nanoid postcss --all` résout
`postcss@8.5.24 -> nanoid@3.3.18`. Les audits complet et production au niveau
`low` retournent chacun zéro vulnérabilité.

## PR Dependabot #14 à #21

| PR  | Catégorie  | Head capturé                               | Run Security final              | État final            |
| --- | ---------- | ------------------------------------------ | ------------------------------- | --------------------- |
| #14 | Transitive | `f677ea32a29279f7e54d6dff0bb326d40acc4505` | `31723111543` — FAILURE Nano ID | CLOSED, non fusionnée |
| #15 | Directe    | `6ec1c60bc7e872d67df35d1669b75eef2bc08c8c` | `31723141518` — FAILURE Nano ID | CLOSED, non fusionnée |
| #16 | Directe    | `9ddb5b33b35128cdfcbda89e7032c9e1d820ed59` | `31723160902` — FAILURE Nano ID | CLOSED, non fusionnée |
| #17 | Transitive | `b21890d3d9fef7d627d44e65f25a56d398874258` | `31723210705` — FAILURE Nano ID | CLOSED, non fusionnée |
| #18 | Transitive | `a8230414027c6ae21f0163c6cd45c2712f33c845` | `31723227890` — FAILURE Nano ID | CLOSED, non fusionnée |
| #19 | Transitive | `793877e662425abb2df87561a105fe4235922798` | `31723293695` — FAILURE Nano ID | CLOSED, non fusionnée |
| #20 | Transitive | `34a65ca967418cd1804ed3e973cc041ee6109d98` | `31750552893` — FAILURE Nano ID | CLOSED, non fusionnée |
| #21 | Directe    | `a9a6009e673209802d551432c06dc1f118fa1f54` | `31750573809` — FAILURE Nano ID | CLOSED, non fusionnée |

#14, #17, #18, #19 et #20 étaient des propositions transitives générées avant
l'application de la politique direct-only. Elles ne sont pas réappliquées dans
M0.2. #15, #16 et #21 étaient des mises à jour directes courantes reportées
hors du hotfix. Aucun changement `eslint-config-next` n'est autorisé dans M0.2.

#20 et #21 ont été ouvertes respectivement à 22:35:08 UTC et 22:35:25 UTC,
avant la publication de la PR #22 à 22:43:58 UTC. Elles utilisaient donc encore
la configuration Dependabot présente sur `main`.

Infrastructure, Launcher Windows et Quality Linux étaient verts sur chacune
des cinq PR R1, comme sur #14 à #16. Un commentaire factuel spécifique a été
publié avant chaque fermeture. Aucune commande de suppression de branche n'a
été exécutée. Dependabot avait automatiquement supprimé les références #14 à
#18 et #21 avant le commit R1 ; les références #19 et #20 existaient encore au
constat final pré-commit. Aucune branche n'a été recréée et aucun paramètre
GitHub n'a été modifié.

## Résultats locaux finaux

| Contrôle                                 | Résultat                                                                                |
| ---------------------------------------- | --------------------------------------------------------------------------------------- |
| `npm run env:check`                      | PASS — Node 22.18.0, npm 10.9.3, Flutter 3.44.1, Dart 3.12.1                            |
| `npm ci`                                 | PASS — 1 136 paquets installés, audit intégré à zéro                                    |
| `npm ls --all`                           | PASS — code 0                                                                           |
| `npm ls nanoid postcss --all`            | PASS — Nano ID 3.3.18, PostCSS 8.5.24                                                   |
| `npm audit --audit-level=low`            | PASS — 0 vulnérabilité                                                                  |
| `npm audit --omit=dev --audit-level=low` | PASS — 0 vulnérabilité                                                                  |
| `npm run licenses`                       | PASS — 1 130 paquets, 0 non déclaré, 0 non approuvé                                     |
| `flutter pub get` et `flutter pub deps`  | PASS — lockfile inchangé, sources Pub                                                   |
| `npm run test:tooling`                   | PASS — 20/20, dont quatre nouveaux tests Dependabot                                     |
| `npm run security:scan`                  | PASS — 307 fichiers, historique, immuable 52/52, 5 scripts qualifiés                    |
| `npm run format`                         | PASS                                                                                    |
| `npm run lint`                           | PASS — six workspaces npm et Flutter analyze                                            |
| `npm run typecheck`                      | PASS — six workspaces npm et Flutter                                                    |
| `npm test`                               | PASS — Web 10, Admin 13, API 22, contrats 1, config 1, UI 4, Flutter 10                 |
| tests dédiés launcher                    | PASS — attente de l'enfant et rejet non-zéro                                            |
| `npm run launcher:verify`                | PASS — code enfant contrôlé 23 propagé                                                  |
| `npm run openapi:validate`               | PASS — 2 chemins, 3 schémas                                                             |
| `npm run ci:validate`                    | PASS — 4 workflows, 4 actions épinglées                                                 |
| `npm run build`                          | PASS — six workspaces npm et APK Flutter debug                                          |
| `npm run db:generate`                    | PASS                                                                                    |
| infrastructure                           | PASS — validate, pull, up, status, check, verify                                        |
| build API + `npm run infra:verify-api`   | PASS — pannes/reprises Redis/PostgreSQL, reset et PID stable                            |
| arrêt infrastructure                     | PASS — conteneurs et réseau arrêtés, volumes préservés                                  |
| `git diff --check`                       | PASS                                                                                    |
| `git fsck --full`                        | PASS — aucune corruption ; objets pendants Dependabot attendus après nettoyage des refs |

L'APK debug final existe à
`apps/mobile/build/app/outputs/flutter-apk/app-debug.apk` et mesure
187 955 067 octets. Le build iOS est **NON EXÉCUTÉ** sur hôte Windows sans
Xcode.

## Incidents de validation conservés

- Le premier `npm install --package-lock-only` et l'essai ciblé avec
  `--no-save` ont calculé un arbre sain sans persister la transitive. La commande
  reproductible retenue est
  `npm update nanoid --package-lock-only --ignore-scripts` ; son diff est limité
  à l'entrée Nano ID.
- Le premier lint global a atteint sa borne sans sortie. Le diagnostic a montré
  cinq workspaces verts, puis a isolé UI. ESLint exécuté directement dans UI a
  passé en 13,4 s, aucun enfant n'est resté actif, et l'unique relance du
  launcher global a passé en 87,8 s. Aucun changement applicatif n'a été requis.
- Les avertissements historiques restent non bloquants : sourcemap CSS
  AdminLTE absente pendant les tests et future migration Kotlin intégrée pour
  `sentry_flutter`.

Aucun échec intermédiaire n'est déclaré PASS ; seuls les résultats finaux
réussis constituent les gates de sortie.

## Réconciliation documentaire M0.2-R1

La correction R1 ne modifie que `DECISION_LOG.md`, ce rapport et la revue
supply-chain M0.2. Les validations ciblées ont produit les résultats suivants :

| Contrôle R1                           | Résultat                                                             |
| ------------------------------------- | -------------------------------------------------------------------- |
| liste des fichiers modifiés           | PASS — exactement les trois documents autorisés                      |
| liens et références documentaires     | PASS — aucun lien relatif cassé, heads et runs R1 présents deux fois |
| `npm run format`                      | PASS — workspaces npm et Flutter                                     |
| `npm run test:tooling`                | PASS — 20/20                                                         |
| `npm run security:scan`               | PASS — 308 fichiers, historique, immuable 52/52, 5 scripts qualifiés |
| identité des cinq fichiers techniques | PASS — objets Git identiques byte-for-byte au head `b5cb2861…`       |
| `git diff --check`                    | PASS                                                                 |
| `git fsck --full`                     | PASS — aucune corruption, objets Dependabot pendants attendus        |

Les builds, tests applicatifs, audits, contrôles d'infrastructure et APK déjà
validés sur l'arbre technique inchangé n'ont pas été relancés, conformément à
la décision CTO M0.2-R1.

## Publication GitHub

La branche autorisée est `fix/m0-2-nanoid-dependabot-policy`. Le commit qui
contient ce rapport n'est volontairement pas auto-référencé. La PR #22 reste
ouverte et Draft vers la base exacte
`79ceddc6cbf04b3d213001417da0841044af8206`. Les quatre workflows Security,
Quality Linux, Infrastructure et Launcher Windows doivent réussir sur le
nouveau head documentaire exact avant la revue CTO. Ready, merge, tag, release,
déploiement, S0.6 et Slice 1 restent interdits.
