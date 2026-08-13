# KORA+ — Rapport final de validation Sprint 0.5

Statut au 2026-08-13 : **validations locales terminées ; GitHub Actions en
attente de la publication de la Draft PR**.

Ce rapport couvre uniquement S0.5 : CI, sécurité supply-chain, observabilité
minimale, OpenAPI de fondation et rollback. S0.6 et Slice 1 ne sont pas
commencés.

## État Git initial

- Racine unique : `C:\Users\moham\Music\KORA-PLUS-FINAL`.
- Baseline : `HEAD = origin/main =
8c3e65e2bcbffb53050b61cab4b953f108491db1`.
- PR S0.4 : #5 fusionnée ; branche distante S0.4 au SHA
  `03aeeff1344a073f6f8fd32eb80e21598d77c37c`.
- Worktree et index : propres avant mutation.
- Aucune branche distante ni PR S0.5 préexistante.
- Branche créée : `chore/s0-5-ci-security-observability`.
- Inventaire, références et SHA-256 de la baseline enregistrés avant mutation.
- Sauvegarde hors dépôt vérifiée :
  `C:\Users\moham\AppData\Local\Temp\kora-s05-baseline-20260812-1615`
  (bundle Git, archive et empreintes).
- Aucun ancien projet KORA+ n'a été consulté.

## Périmètre exact des fichiers

Le candidat S0.5 contient exactement 56 fichiers, rapport inclus :

```text
.github/dependabot.yml
.github/workflows/infrastructure.yml
.github/workflows/launcher-windows.yml
.github/workflows/quality-linux.yml
.github/workflows/security.yml
README.md
apps/admin/app/error.tsx
apps/admin/instrumentation-client.ts
apps/admin/instrumentation.ts
apps/admin/lib/observability/sentry.test.ts
apps/admin/lib/observability/sentry.ts
apps/admin/package.json
apps/admin/tsconfig.json
apps/api/.env.example
apps/api/package.json
apps/api/src/app.factory.ts
apps/api/src/common/filters/global-exception.filter.spec.ts
apps/api/src/common/filters/global-exception.filter.ts
apps/api/src/config/runtime-config.spec.ts
apps/api/src/config/runtime-config.ts
apps/api/src/main.ts
apps/api/src/observability/sentry.spec.ts
apps/api/src/observability/sentry.ts
apps/api/src/observability/structured-logger.ts
apps/mobile/lib/main.dart
apps/mobile/lib/src/observability/sentry_observability.dart
apps/mobile/pubspec.lock
apps/mobile/pubspec.yaml
apps/mobile/test/golden_test.dart
apps/mobile/test/sentry_observability_test.dart
apps/web/app/error.tsx
apps/web/instrumentation-client.ts
apps/web/instrumentation.ts
apps/web/lib/observability/sentry.test.ts
apps/web/lib/observability/sentry.ts
apps/web/package.json
apps/web/tsconfig.json
docs/api/openapi.yaml
docs/governance/DECISION_LOG.md
docs/operations/FOUNDATION_ROLLBACK.md
docs/qa/REQUIREMENTS_TRACEABILITY_MATRIX.md
docs/qa/SPRINT_0_5_FINAL_VALIDATION_REPORT.md
docs/security/THIRD_PARTY_DEPENDENCY_REVIEW_S0_5.md
docs/security/THREAT_MODEL.md
infra/redis/entrypoint.sh
package-lock.json
package.json
scripts/ci/validate-workflows.mjs
scripts/ci/validate-workflows.test.mjs
scripts/ci/verify-launcher-failure.mjs
scripts/infra/lib.mjs
scripts/openapi/validate-openapi.mjs
scripts/openapi/validate-openapi.test.mjs
scripts/report-licenses.mjs
scripts/security/scan-repository.mjs
scripts/security/scan-repository.test.mjs
```

Les vérifications de scope confirment : aucune migration ou modification du
schéma Prisma, aucune route produit, aucune fonctionnalité catalogue, identité,
paiement, entitlement, média ou finance, aucune modification UI/UX et aucun
fichier de S0.6. Les 68 statuts produit de la matrice de traçabilité sont
inchangés.

## CI et permissions

Quatre workflows sont ajoutés :

| Workflow         | Runner           | Gate principal                                                    |
| ---------------- | ---------------- | ----------------------------------------------------------------- |
| Quality Linux    | `ubuntu-latest`  | environnement, outillage, format, lint, typecheck, tests, builds  |
| Launcher Windows | `windows-latest` | tests dédiés, enfant code 23, matrice racine                      |
| Infrastructure   | `ubuntu-latest`  | Compose S0.4, cycle de vie, API et pannes/reprises                |
| Security         | `ubuntu-latest`  | arbre, deux audits, licences, secrets, provenance, locks, OpenAPI |

Tous se déclenchent sur Pull Request, push vers `main` et lancement manuel.
Chaque job a un timeout, une concurrence avec annulation des runs obsolètes et
la permission globale unique `contents: read`. Aucun secret KORA+, aucun
`pull_request_target`, aucune permission d'écriture et aucun déploiement ne sont
présents.

Les quatre actions utilisées sont verrouillées sur des SHA complets et validées
par la politique locale : `actions/checkout`, `actions/setup-node`,
`actions/setup-java` et `subosito/flutter-action`.

Dependabot est configuré en hebdomadaire pour npm et Pub, avec cinq PR ouvertes
au maximum par écosystème. Aucun service payant ni paramètre GitHub externe
n'est activé par le dépôt.

## Dépendances et licences

### npm

Les dépendances directes exactes ajoutées sont `@sentry/node@10.70.0` pour
l'API, le Web et l'Admin, ainsi que `@sentry/react@10.70.0` pour le Web et
l'Admin. Le lockfile ajoute 31 entrées : 17 MIT, 12 Apache-2.0, une
BSD-3-Clause et une ISC. Toutes viennent de `https://registry.npmjs.org/`.

`@sentry/nextjs` a été évalué puis rejeté : la version courante introduisait un
CLI à licence FSL et un `postinstall`, tandis qu'une version ancienne évaluée
exposait sept avis modérés. Le graphe final ne contient ni `@sentry/cli`, ni
FSL, ni nouveau script d'installation. Les cinq scripts présents restent les
chemins S0.4 qualifiés.

L'inventaire final couvre 1 130 paquets npm : zéro licence non déclarée et zéro
licence non approuvée. Les audits complet et production retournent zéro
vulnérabilité.

Sur Linux, npm installe sept paquets optionnels supplémentaires, soit 1 137 au
total. Les deux variantes `@img/sharp-libvips-linux-x64@1.3.2` et
`@img/sharp-libvips-linuxmusl-x64@1.3.2` sont sous LGPL-3.0-or-later ; elles sont
qualifiées nominativement, sans approbation globale de cette licence, selon la
revue tierce S0.3 déjà acceptée.

### Flutter

La dépendance directe exacte est `sentry_flutter@9.26.0` (MIT). Dix paquets
Pub sont ajoutés : `ffi`, `ffi_leak_tracker`, `http`, `jni`,
`package_info_plus`, `package_info_plus_platform_interface`,
`plugin_platform_interface`, `sentry`, `sentry_flutter` et `win32`. Ils sont
verrouillés et proviennent tous de `https://pub.dev` ; les transitives sont sous
BSD-3-Clause.

## Sentry et redaction

- Sans DSN, aucun adaptateur n'est initialisé. L'API et les runtimes serveur
  Next ne chargent pas le SDK Node ; Flutter exécute directement l'application.
- Aucun DSN réel, token d'upload, compte Sentry ou URL de production n'existe
  dans le dépôt.
- Avec configuration externe valide : environnement et release sont bornés,
  `sendDefaultPii=false`, logs et traces sont désactivés ; Flutter désactive en
  plus performance, breadcrumbs HTTP/print, requêtes échouées, screenshots et
  identifiants de hiérarchie.
- Les callbacks `beforeSend` retirent requête, utilisateur et, sur Flutter,
  breadcrumbs, puis assainissent récursivement secrets, tokens, OTP, cookies,
  authorization, email, téléphone, DSN, IP, identifiant appareil et paiement.
- L'API ne capture que les erreurs HTTP 5xx et transmet uniquement le chemin
  sans query string et l'identifiant de requête.
- Aucun événement réel n'a été envoyé : aucun DSN de test autorisé n'existe.

Les tests négatifs sans DSN et les tests de redaction passent sur API, Web,
Admin et Flutter.

## OpenAPI et rollback

`docs/api/openapi.yaml` déclare OpenAPI 3.1.0 et exactement deux chemins :
`GET /health/live` et `GET /health/ready`. Le validateur vérifie chemins,
méthodes, statuts 200/503, dépendances PostgreSQL/Redis, schémas et références.
Ses tests négatifs refusent toute route métier et toute référence non résolue.

Le runbook couvre l'identification du SHA fautif, l'annulation ciblée d'un run,
le revert Git normal, la préservation des volumes, la revalidation API et
Compose, les critères de santé et la traçabilité d'incident. Il interdit
explicitement force-push, réécriture, commandes destructives et suppression
globale.

## Résultats locaux finaux

| Contrôle                                 | Résultat final                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| `npm run env:check`                      | PASS — Node 22.18.0, npm 10.9.3, Flutter 3.44.1, Dart 3.12.1                 |
| `npm ci --ignore-scripts`                | PASS — code 0, 1 136 paquets recréés                                         |
| `npm ls --all`                           | PASS — code 0                                                                |
| `npm audit --audit-level=low`            | PASS — 0 vulnérabilité                                                       |
| `npm audit --omit=dev --audit-level=low` | PASS — 0 vulnérabilité                                                       |
| `npm run licenses`                       | PASS — 1 130 paquets, 0 non déclaré, 0 non approuvé                          |
| `flutter pub deps`                       | PASS — graphe résolu depuis Pub                                              |
| `npm run format`                         | PASS                                                                         |
| `npm run lint`                           | PASS — ESLint + Flutter analyze sans finding                                 |
| `npm run typecheck`                      | PASS                                                                         |
| `npm test`                               | PASS — 61/61, dont les 48 historiques et 13 tests S0.5                       |
| `npm run test:tooling`                   | PASS — 10/10                                                                 |
| test dédié du launcher                   | PASS — attente du child et propagation non-zéro                              |
| enfant contrôlé code `23`                | PASS — rejet vérifié                                                         |
| `npm run ci:validate`                    | PASS — 4 workflows, 4 actions approuvées                                     |
| `npm run openapi:validate`               | PASS — 2 chemins, 3 schémas, références résolues                             |
| `npm run security:scan`                  | PASS — 305 fichiers, historique, immuable 52/52, 5 scripts qualifiés         |
| `npm run build`                          | PASS — six workspaces npm + APK Flutter debug                                |
| `npm run db:generate`                    | PASS — Prisma Client 7.9.1                                                   |
| `npm run infra:status`                   | PASS — PostgreSQL/Redis healthy                                              |
| `npm run infra:check`                    | PASS — connexions et smoke checks                                            |
| `npm run infra:verify`                   | PASS — persistance, reset borné, idempotence, ressources étrangères intactes |
| build API + `npm run infra:verify-api`   | PASS — même PID, pannes/reprises Redis et PostgreSQL, reset, 0 fuite         |
| APK debug                                | PASS — 187 955 067 octets, régénéré le 2026-08-13                            |
| absence de processus orphelin            | PASS — aucun nouveau Node/Dart ; daemon Gradle final identifié et arrêté     |
| `git diff --check`                       | PASS                                                                         |
| `git fsck --full`                        | PASS — aucune corruption ; objets non référencés seulement                   |

Répartition des 61 tests applicatifs : Web 10, Admin 13, API 22, contrats 1,
configuration 1, UI partagée 4 et Flutter 10. Les 13 ajouts S0.5 sont Web 3,
Admin 3, API 4 et Flutter 3.

### Incidents diagnostiqués pendant la validation

- Deux vérifications API ont initialement expiré à 30 secondes. La cause était
  l'import statique de `@sentry/node` même sans DSN. Le SDK est désormais chargé
  dynamiquement uniquement avec DSN ; tests, build et vérification de pannes
  complète passent ensuite.
- Le premier téléchargement Gradle des transitives `jni` a dépassé la borne de
  temps après production de l'APK. Les deux artefacts Maven ont été mis en cache,
  les daemons ciblés arrêtés, puis le build hors ligne et le build racine ont
  tous deux passé.
- Un premier `npm test` sous bac à sable a échoué uniquement sur l'écriture du
  lockfile du SDK Flutter externe. Le même launcher rejoué avec l'accès déjà
  autorisé a passé 61/61, sans PID résiduel.
- Le premier run GitHub a exposé trois écarts Linux : inspection d'images
  Docker par tag après un pull par digest, deux variantes libvips optionnelles
  qualifiées en S0.3 mais absentes de l'installation Windows, et chemins de
  polices Flutter sensibles à la casse. Les trois corrections ciblées ont été
  validées localement ; Security et Launcher ont passé au run suivant.
- Le deuxième run GitHub a ensuite prouvé deux derniers écarts : le script
  Redis était publié en mode Git `100644`, et les goldens raster produits sous
  Windows diffèrent de 2,41 à 3,57 % sous Skia Linux malgré les mêmes polices.
  Le script est désormais publié en `100755`. Les goldens restent stricts sur
  leur plateforme de référence Windows, couverte par Launcher ; Linux conserve
  les sept tests Flutter fonctionnels, sans seuil arbitraire ni régénération.

Ces échecs intermédiaires ne sont pas comptés comme PASS ; seuls les contrôles
finaux réussis figurent comme gates de sortie.

## Trois revues finales

1. **CI et reproductibilité** : multi-OS, timeouts, concurrence, installation
   déterministe, launcher code 23 et arrêt Docker vérifiés. Finding corrigé :
   ajout explicite de l'audit production dans le workflow sécurité.
2. **Sécurité et observabilité** : provenance, scripts, licences, secrets,
   redaction, absence de DSN et chargement conditionnel revus. Finding corrigé :
   suppression du chargement serveur Next sans DSN.
3. **OpenAPI, rollback, Git et Blueprint** : routes limitées à la santé, aucune
   dérive produit, 68 statuts inchangés, rollback non destructif et docs revus.
   Findings corrigés : critères de retour en service, traçabilité d'incident et
   délimiteur Markdown d'autorité.

Aucun finding bloquant ne reste ouvert.

## GitHub Actions et Draft PR

La Draft PR #6 est ouverte vers `main` avec exactement 56 fichiers. Le premier
run réel sur `6beeae8d2b9c4d22aa87da8703f5088c8a0923ac` a donné : Launcher Windows
PASS, Infrastructure FAIL, Security FAIL et Quality Linux FAIL.

Le deuxième run sur `c5def6538acebe49440903197a133db204765080` a donné :

- Launcher Windows : PASS en 4 min 02 s, run `31687251109` ;
- Security : PASS en 1 min 58 s, run `31687251219` ;
- Infrastructure : FAIL en 1 min 01 s, run `31687251068`, bit exécutable Redis
  absent ;
- Quality Linux : FAIL en 2 min 56 s, run `31687251141`, dérive raster des trois
  goldens Windows uniquement ; tous les autres tests avaient passé.

Le troisième run réel, sur le commit d'implémentation final
`575f9bf9eec90725c75f54cd1299ef916ff0c668`, est entièrement vert :

- Infrastructure : PASS en 1 min 46 s, run `31689107113` ;
- Launcher Windows : PASS en 4 min 30 s, run `31689106909` ;
- Quality Linux : PASS en 6 min 34 s, run `31689106870` ;
- Security : PASS en 1 min 04 s, run `31689106974`.

Chaque run référence le même head exact. Le commit documentaire de ce rapport
sera poussé séparément et couvert à son tour par les quatre workflows. Aucun
état défaillant n'est présenté comme PASS.

La PR reste en Draft ; Ready, merge, tag, release et déploiement sont interdits.

## Limites et dettes résiduelles

- `Gitleaks` : **NON EXÉCUTÉ — binaire indisponible**. Le scanner S0.5 haute
  confiance couvre les fichiers candidats et l'historique Git, sans prétendre
  remplacer totalement Gitleaks.
- Code Scanning et paramètres Dependabot GitHub externes : **NON MODIFIÉS** ;
  aucune autorisation ne couvre les paramètres du repository.
- Build iOS : **NON EXÉCUTÉ — hôte Windows sans Xcode** ; aucun runner payant
  n'a été engagé.
- Aucun événement Sentry réel : **NON EXÉCUTÉ — aucun DSN de test autorisé**.
- `sentry_flutter@9.26.0` applique encore le plugin Kotlin Gradle ; Flutter
  avertit qu'une future migration vers le Kotlin intégré sera nécessaire. Le
  build Android actuel passe.
- `@adminlte/react` référence une sourcemap CSS absente pendant les tests Admin ;
  avertissement préexistant, tests et builds verts.
- Le premier `npm ci --ignore-scripts` a été anormalement long sur le cache et
  le registre locaux mais s'est terminé avec code 0 ; les Actions fourniront
  la mesure Linux propre.

## État de sortie vérifié

- Branche : `chore/s0-5-ci-security-observability`.
- Base inchangée : `8c3e65e2bcbffb53050b61cab4b953f108491db1`.
- Commit d'implémentation validé :
  `575f9bf9eec90725c75f54cd1299ef916ff0c668`.
- Draft PR #6 : ouverte, Draft, fusionnable, 56 fichiers.
- Aucun processus de validation orphelin.
- S0.6 et Slice 1 : non commencés.

Verdict : **S0.5 CI, SECURITY AND OBSERVABILITY IMPLEMENTED — READY FOR CTO
REVIEW — S0.6 NOT STARTED**.
