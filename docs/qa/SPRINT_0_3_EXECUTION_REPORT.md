# Rapport d’exécution — Sprint 0.3

Date de remédiation : 2026-07-29
Branche : `chore/s0-3-application-foundations`
Baseline : `7f58b194c85757c0be93485aa4706242e8acd915`
Statut produit : **Implemented — pending CTO review**
Verdict d’exécution : **READY FOR CTO REVIEW**

## Reprise après interruption

La reprise a commencé en lecture seule depuis l’état réellement présent sur
disque. La branche courante était
`chore/s0-3-application-foundations`, sans upstream, avec un index vide. Les
quatre commits S0.3 attendus étaient les quatre derniers commits. Les
modifications de remédiation non commitées ont été conservées intégralement.

Aucun processus npm, Node, Flutter, Dart, Gradle, Java ou sdkmanager n’était
actif. Les fichiers de verrouillage Gradle présents n’étaient détenus par aucun
processus. `package.json`, `package-lock.json` et
`node_modules/.package-lock.json` étaient des documents JSON valides. Aucune
installation npm, aucun `npm audit fix` et aucune opération Git destructive
n’ont été exécutés pendant la reprise.

## Intégrité de l’historique

Les quatre commits d’origine restent distincts et inchangés :

| SHA | Objet |
|---|---|
| `c55d67e967631ccc50eed648ae5012910bee28d4` | fondations mobile |
| `395c950124abd1b23fa20c4f764425ffab37cdbf` | fondations API |
| `588abc535c0b7aba3d5f9bc29d4c88df716ac25d` | fondations Web/Admin |
| `259943c4a59dbf1fd6bc30bc175c4777ac0c0f90` | intégration des fondations |

Aucun amend, rebase, squash, force-push, tag, release ou démarrage de S0.4
n’est autorisé ou effectué.

## Remédiations appliquées

### Sécurité npm

L’état initial était de 33 paquets signalés par l’audit complet, dont
1 modéré et 32 élevés, et de 4 paquets dans le graphe production, dont
1 modéré et 3 élevés.

Quatre overrides exacts ont été ajoutés :

- `postcss@8.5.24` ;
- `sharp@0.35.3` ;
- `minimatch@10.2.6` ;
- `brace-expansion@5.0.8`.

`npm audit fix` n’a pas été utilisé. Les audits complet et production
post-remédiation terminent avec code 0 et zéro vulnérabilité. La qualification
par avis, chemin, surface et exploitabilité figure dans
[`SPRINT_0_3_SECURITY_REMEDIATION.md`](../security/SPRINT_0_3_SECURITY_REMEDIATION.md).

### Licences

Les composants LGPL, MPL, EPL et CC-BY sont qualifiés dans
[`THIRD_PARTY_LICENSE_REVIEW_S0_3.md`](../security/THIRD_PARTY_LICENSE_REVIEW_S0_3.md).
La provenance `caniuse.com`, Alexis Deveria et l’auteur du package
`caniuse-lite`, Ben Briggs, sont consignés dans
[`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md).

La conclusion n’est pas présentée comme juridique : la stratégie de packaging
et les obligations applicables aux artefacts effectivement distribués sont
explicitement soumises au CTO/juridique.

### Android

Le répertoire partiel exact du NDK `28.2.13676358`, dépourvu de
`source.properties`, a été supprimé puis réinstallé avec le gestionnaire SDK
officiel. L’installation finale déclare :

```text
Pkg.Desc = Android NDK
Pkg.Revision = 28.2.13676358
Pkg.BaseRevision = 28.2.13676358
Pkg.ReleaseName = r28c
```

`flutter doctor -v`, `flutter analyze`, les 7 tests Flutter et
`flutter build apk --debug` passent.

APK local ignoré par Git :

```text
apps/mobile/build/app/outputs/flutter-apk/app-debug.apk
taille = 149123694 octets
SHA-256 = 53C6F91153307A7049F1A22E286DB822C99AEFDEB91728CFD35084F34FC8BD64
```

Pendant ce build demandé, Gradle a automatiquement installé Android
Build-Tools `36.0.0` et CMake `3.22.1`. Ces deux installations n’étaient pas
explicitement autorisées dans la consigne qui limitait le changement global au
NDK. Après l’interruption, le CTO a explicitement autorisé leur conservation
pour la seule chaîne de build Android. Elles ne sont ni supprimées ni modifiées
et cette décision n’autorise aucune autre installation ou mise à jour du SDK.

### Démarrage de l’API compilée

Le smoke initial a montré que Nest produit `dist/src/main.js`, tandis que le
script `start` pointait vers `dist/main.js`. Le manifeste API a été corrigé
vers `node dist/src/main.js`. Le contre-audit Foundation a aussi relevé que les
health checks devaient rester hors du préfixe applicatif : ils sont maintenant
exposés uniquement par `/health/live` et `/health/ready`, tandis que
`/api/v1` reste réservé aux futures routes applicatives. Format, lint,
typecheck, 12 tests API, build Nest et smoke via
`npm.cmd run start --workspace @kora-plus/api` passent ensuite.

## Contrôles

| Contrôle | État courant |
|---|---|
| `npm.cmd run env:check` | PASS — code 0 ; Node 22.18.0, npm 10.9.3, Flutter 3.44.1, Dart 3.12.1 |
| versions ciblées | PASS — code 0 ; postcss 8.5.24, sharp 0.35.3, minimatch 10.2.6, brace-expansion 5.0.8 |
| `npm.cmd ls --all` | PASS — code 0, aucun problem/invalid/extraneous/unmet |
| `npm.cmd audit --json` | PASS — code 0 ; 0 vulnérabilité |
| `npm.cmd audit --omit=dev --json` | PASS — code 0 ; 0 vulnérabilité |
| `npm.cmd run licenses` | PASS — code 0 ; 1 092 paquets installés, 0 licence non déclarée |
| `npm.cmd run format` | PASS — code 0 ; 6 workspaces et mobile, 0 changement |
| `npm.cmd run lint` | PASS — code 0 ; 6 workspaces et mobile |
| `npm.cmd run typecheck` | PASS — code 0 ; 6 workspaces et mobile |
| `npm.cmd test` | PASS — code 0 ; Web 7, Admin 8, API 12, contracts 1, config 1, UI 4, mobile 7 |
| `npm.cmd run build` | PASS — code 0 ; Web, Admin, API, contracts, config, UI et APK debug |
| tests et builds ciblés | PASS — codes 0 ; Web, Admin, API, contracts, config et UI séparément |
| smokes Web/Admin | PASS — code 0 ; HTTP 200, titres/robots conformes, Admin `robots.txt` bloque `/` |
| smoke API compilée | PASS — code 0 ; `/health/live` 200 ; `/health/ready` 503 ; anciens chemins préfixés 404 |
| `dart format --output=none --set-exit-if-changed .` | PASS — code 0 ; 13 fichiers, 0 changement |
| `flutter doctor -v` | PASS — code 0 pour Android ; Visual Studio absent, hors périmètre |
| `flutter analyze` | PASS — code 0 ; aucun problème |
| `flutter test` | PASS — code 0 ; 7 tests |
| `flutter build apk --debug` | PASS — code 0 |
| `flutter pub deps` | PASS — code 0 ; inventaire résolu |
| manifeste immuable | PASS — code 0 ; 52/52 |
| secrets et fichiers `.env` interdits | PASS — code 0 ; 0 finding |
| métier prématuré | PASS — code 0 ; 0 finding |
| TODO/FIXME, lorem ipsum, marqueurs IA | PASS — code 0 ; 0 finding actionnable |
| artefacts générés suivis | PASS — code 0 ; 0 ; APK confirmé ignoré |
| `git diff --check` | PASS — code 0 |
| `git fsck --full` | PASS — code 0 ; cinq blobs orphelins non référencés après contrôles d’index |
| audit Design/QA indépendant | PASS AVEC RÉSERVES — goldens conformes ; captures runtime Web/Admin absentes |
| audit Foundation Contract indépendant | PASS — aucun finding résiduel après remédiation |
| audit Security/Supply Chain indépendant | PASS technique — revue juridique toujours requise |
| build iOS | NON EXÉCUTÉ — hôte Windows |

## Audits indépendants

- **Foundation Contract Auditor — PASS** : endpoints health conformes,
  inventaire et codes de sortie complets, aucun métier prématuré et S0.4 non
  commencé.
- **Security & Supply Chain Auditor — PASS technique** : graphe et audits npm
  propres, lockfile cohérent, licences et attributions qualifiées. Ce verdict
  ne constitue pas une approbation juridique.
- **Design QA Auditor — PASS AVEC RÉSERVES** : trois goldens mobiles conformes,
  shells Web/Admin statiquement conformes ; captures runtime Web/Admin et
  validation visuelle finale du Product Owner encore requises.

## Inventaire exact avant commits

Treize fichiers composent le diff final avant commits : dix fichiers modifiés
et trois fichiers ajoutés. Aucun artefact généré n’en fait partie.

```text
M  README.md
M  apps/api/README.md
M  apps/api/package.json
M  apps/api/src/app.factory.ts
M  apps/api/test/app.integration.spec.ts
M  docs/qa/REQUIREMENTS_TRACEABILITY_MATRIX.md
M  docs/qa/SPRINT_0_3_EXECUTION_REPORT.md
M  docs/security/THREAT_MODEL.md
M  package-lock.json
M  package.json
A  THIRD_PARTY_NOTICES.md
A  docs/security/SPRINT_0_3_SECURITY_REMEDIATION.md
A  docs/security/THIRD_PARTY_LICENSE_REVIEW_S0_3.md
```

## Gate de publication

GitHub CLI est installé et authentifié sur `Mohamed724000/kora`. Les conditions
techniques de publication sont remplies. Seuls des commits correctifs atomiques,
le push sans force de la branche courante et une PR brouillon vers `main` sont
autorisés. La PR ne peut passer en mode Ready, être fusionnée, donner lieu à
une release ou à une distribution publique/commerciale avant la revue
juridique et les validations CTO/visuelle requises.

S0.4 reste **Not started — Docker blocker connu**.
