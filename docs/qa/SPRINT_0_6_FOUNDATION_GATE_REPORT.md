# KORA+ — Sprint 0.6 Foundation Gate Report

Date d’exécution : 2026-08-14

Branche : `chore/s0-6-foundation-gate`

Baseline exacte : `40a224edc1dc018a080b6c188a804e361e96b5ef`

Verdict : **PASS WITH RESERVATIONS — CTO REVIEW PENDING**

## Portée et historique vérifié

S0.6 est un audit documentaire indépendant des fondations. Aucun code,
workflow, manifeste, lockfile, schéma, migration ou comportement produit n’a
été modifié.

| Lot  | PR  | Merge commit exact                         |
| ---- | --- | ------------------------------------------ |
| S0.4 | #5  | `8c3e65e2bcbffb53050b61cab4b953f108491db1` |
| S0.5 | #6  | `c080ec0529e758203d4326f7ec5b0b0159cbdad7` |
| M0.1 | #13 | `79ceddc6cbf04b3d213001417da0841044af8206` |
| M0.2 | #22 | `40a224edc1dc018a080b6c188a804e361e96b5ef` |

Le préflight a confirmé `origin/main` sur la baseline exacte, un worktree
propre, un index vide, aucune opération Git en cours et aucune PR ouverte. La
branche locale `main`, uniquement en retard de quatre commits, a été avancée
par fast-forward avant la création de la branche S0.6.

## Environnement

| Outil          | Valeur vérifiée    | Résultat |
| -------------- | ------------------ | -------- |
| Node.js        | `22.18.0`          | PASS     |
| npm            | `10.9.3`           | PASS     |
| Flutter        | `3.44.1`           | PASS     |
| Dart           | `3.12.1`           | PASS     |
| Git            | `2.54.0.windows.1` | PASS     |
| Docker Engine  | `29.4.2`           | PASS     |
| Docker Compose | `5.1.3`            | PASS     |
| Hôte           | Windows x64        | constat  |

Empreintes avant et après toutes les opérations :

- `package-lock.json` :
  `54448ca65a03d32f590733d9f6c4e189e9a6455884efb46923850f9060672492` ;
- `apps/mobile/pubspec.lock` :
  `44c54adee80b74f8860d7cc87158fedad520f60db0bd918d8d19bef5a8326b7e`.

Les deux empreintes sont strictement stables.

## Revue 1 — QA et release readiness

### Installation et contrôles statiques

| Commande                                          | Code | Résultat factuel                                                                                         |
| ------------------------------------------------- | ---: | -------------------------------------------------------------------------------------------------------- |
| `npm.cmd run env:check`                           |    0 | versions verrouillées confirmées                                                                         |
| `npm.cmd ci`                                      |    0 | 1 136 paquets ajoutés, audit d’installation à zéro                                                       |
| `flutter pub get --directory apps/mobile`         |    0 | résolution terminée, lockfile stable                                                                     |
| `npm.cmd ls --all`                                |    0 | arbre résolu ; optional peer dependencies non installées et artefacts optionnels de plateforme seulement |
| `npm.cmd run format`                              |    0 | six workspaces npm et Flutter conformes                                                                  |
| `npm.cmd run lint`                                |    0 | ESLint et Flutter analyze sans finding                                                                   |
| `npm.cmd run typecheck`                           |    0 | TypeScript/Dart stricts conformes                                                                        |
| `npm.cmd run test:tooling`                        |    0 | 20/20 tests                                                                                              |
| `npm.cmd run db:generate`                         |    0 | Prisma Client 7.9.1 généré, schéma vide de modèle métier                                                 |
| `npm.cmd run openapi:validate`                    |    0 | 2 paths de santé, 3 schémas, références résolues                                                         |
| `npm.cmd run ci:validate`                         |    0 | 4 workflows et 4 actions SHA approuvées                                                                  |
| `node --test scripts/run-workspace-task.test.mjs` |    0 | 2/2 tests launcher                                                                                       |
| `npm.cmd run launcher:verify`                     |    0 | code enfant contrôlé 23 correctement rejeté                                                              |

La première tentative `npm test` a passé tous les workspaces npm mais n’a pas
atteint Flutter : le sandbox a refusé l’accès au lockfile du SDK situé hors du
workspace. Elle n’est pas comptée comme une preuve et n’a modifié aucun fichier.
La commande, les tests, assertions et timeouts sont restés inchangés ; seul
l’accès au cache SDK a été accordé aux trois exécutions complètes suivantes.

### Trois exécutions globales consécutives

| Exécution | Code |  Durée | Résultats                                                         |
| --------- | ---: | -----: | ----------------------------------------------------------------- |
| 1         |    0 | 36,1 s | Web 10, Admin 13, API 22, Contracts 1, Config 1, UI 4, Flutter 10 |
| 2         |    0 | 33,2 s | mêmes suites, tous les tests passent                              |
| 3         |    0 | 37,3 s | mêmes suites, tous les tests passent                              |

Aucun timeout, retry, skip ou changement d’assertion. Le warning répétable de
source map CSS absente dans `@adminlte/react` reste non bloquant et déjà connu.

### Test API historiquement sensible

Commande inchangée :

```text
npm.cmd test --workspace @kora-plus/api -- test/app.integration.spec.ts --runTestsByPath
```

Cinq processus successifs terminent avec le code 0, 9/9 tests chacun, en
8,169 s, 8,792 s, 7,991 s, 7,898 s et 7,667 s. Aucun timeout ni instabilité
n’est observé.

### Builds

`npm.cmd run build` termine avec le code 0 : Web, Admin, API, Contracts,
Config et UI sont construits, puis l’APK Flutter debug est produit.

- APK : `apps/mobile/build/app/outputs/flutter-apk/app-debug.apk` ;
- taille : `187955067` octets ;
- SHA-256 :
  `2d9f3733a77479867375d3ec26e70e0f47f36bbc16e908e84a56bd16d5d2c972` ;
- iOS : **NON EXÉCUTÉ** — Windows ne fournit pas macOS/Xcode ;
- warning Flutter : future migration du plugin `sentry_flutter` vers le
  Built-in Kotlin, sans impact sur le build actuel.

## Revue infrastructure

| Contrôle              | Résultat                                                                                |
| --------------------- | --------------------------------------------------------------------------------------- |
| préparation locale    | 0 fichier créé, 3 fichiers privés existants préservés                                   |
| validation Compose    | projet, services, ports loopback, secrets, labels et noms exacts                        |
| pull                  | PostgreSQL `18.4-alpine3.24` et Redis `7.2.15-alpine3.21` vérifiés par digest           |
| health/smoke          | PostgreSQL healthy et `SELECT 1`; Redis healthy et `PONG`                               |
| persistance           | marqueurs PostgreSQL/Redis conservés après restart                                      |
| reset ciblé           | seuls `kora-plus-local-postgres-data` et `kora-plus-local-redis-data` supprimés/recréés |
| ressources étrangères | conteneurs, images, réseaux et volumes inchangés avant/après reset                      |
| idempotence           | doubles down/up conformes                                                               |
| API saine             | `/health/live=200`, `/health/ready=200`, routes préfixées `404`                         |
| panne Redis           | 3 fois live `200`, ready `503`, raison générique, PID stable                            |
| reprise Redis         | ready `200`, même PID                                                                   |
| panne PostgreSQL      | 3 fois live `200`, ready `503`, raison générique, PID stable                            |
| reprise PostgreSQL    | ready `200`, même PID                                                                   |
| reset sous API        | live/ready récupèrent à `200`, même PID `42420`                                         |
| redaction             | aucune valeur locale ni DSN brute dans réponses/logs capturés                           |

État final : aucun conteneur ni réseau `kora-plus-local`; les deux volumes
nommés sont conservés. Les deux conteneurs étrangers `docker-postgres-1` et
`docker-redis-1`, leurs volumes et le réseau `docker_default` restent
inchangés.

## Revue 2 — Security et privacy

| Contrôle                                 | Code / état | Résultat                                                                                                              |
| ---------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------- |
| `npm audit --audit-level=low`            | 0           | 0 vulnérabilité                                                                                                       |
| `npm audit --omit=dev --audit-level=low` | 0           | 0 vulnérabilité                                                                                                       |
| `npm.cmd run licenses`                   | 0           | 1 130 paquets, 0 licence absente, 0 non approuvée                                                                     |
| `npm.cmd run security:scan`              | 0           | 308 fichiers avant rapport puis 309 au contrôle final, historique scanné, immuable 52/52, 5 install scripts qualifiés |
| pins et lock npm                         | PASS        | versions directes exactes et métadonnées byte-for-byte                                                                |
| `@types/react`                           | PASS        | une seule installation physique racine `19.2.18`                                                                      |
| topologie lockfile                       | PASS        | 0 installation physique imbriquée sous `apps/**` ou `packages/**`                                                     |
| Dependabot versionné                     | PASS        | npm/Pub directs patch/minor, aucune auto-fusion                                                                       |
| sources                                  | PASS        | registres npm/Pub officiels imposés                                                                                   |
| secrets/PII                              | PASS        | scanner dépôt + historique, aucun secret haute confiance ou donnée privée                                             |
| redaction                                | PASS        | API/Web/Admin/Flutter couverts par tests ; Sentry inactif sans DSN                                                    |
| workflows                                | PASS        | lecture seule et actions épinglées par SHA                                                                            |
| surface prématurée                       | PASS        | aucune URL média brute, route ou logique métier détectée                                                              |

`npm find-dupes`, observation secondaire non bloquante, a dépassé sa borne de
300 s et est déclaré **NON CONCLUANT**, jamais PASS. Il n’a produit aucun diff
ni processus orphelin. L’absence de fragmentation inattendue est établie par
`npm ls --all` code 0, le scanner bloquant, la lecture structurée du lockfile
(zéro entrée imbriquée) et le contrôle physique du singleton React.

### Services GitHub constatés sans mutation

- Secret Scanning : `enabled` ; push protection : `enabled` ; 0 alerte ouverte ;
- Dependabot Alerts : **désactivé**, API `403` ;
- Dependabot security updates : **disabled** dans les métadonnées du dépôt ;
- Code Scanning : **non configuré**, API `404 no analysis found` ;
- Gitleaks : **NON EXÉCUTÉ**, binaire indisponible ;
- Sentry réel : **NON EXÉCUTÉ**, aucun DSN autorisé ou configuré.

S0.6 ne modifie aucun paramètre GitHub. Les gates versionnés et audits locaux
restent verts, mais les services externes désactivés/non configurés constituent
une réserve explicite pour la revue CTO.

## Revue 3 — Design QA

- les cinq onglets exacts sont `Accueil`, `Découvrir`, `Mes achats`, `Lecteur`
  et `Compte`, dans cet ordre ; navigation et sémantique `tap` testées ;
- loading, vide, erreur et offline sont présents ; la reprise offre une cible
  tactile d’au moins 44 dp ;
- aucun mini-player n’est rendu sans média réel ;
- les trois goldens Windows à 341 px passent strictement sans régénération ;
- les polices Roboto/Material Icons exigées sont chargées depuis le SDK
  verrouillé et les assets/goldens suivis restent inchangés ;
- Web répond HTTP 200, est structuré, responsive par breakpoint, navigable au
  clavier et n’expose ni achat, ni formulaire, ni audio/vidéo ;
- Admin répond HTTP 200, présente exactement 13 zones, leurs 13 cibles uniques,
  un contraste accentué AA ≥ 4,5 et aucune donnée ou métrique fictive ;
- `@tanstack/react-table@8.21.3` reste le moteur autorisé ; aucun autre moteur
  ni tableau métier n’est introduit ;
- l’unique archive AdminLTE canonique a 547 entrées, le SHA-256
  `9b69b877e005e41e06c21f8a4f52cb3b999464e3446fbb961ff962c69b450b5d`
  et le manifeste `admin-lte|4.1.0|MIT` ; aucun HTML Admin n’est suivi par Git ;
- les quatre captures Web/Admin versionnées et les trois goldens ont été
  inspectés visuellement sans réécriture ; aucune régression évidente par
  rapport à la fondation S0.3 approuvée n’est constatée.

L’inspection interactive par navigateur intégré est **NON EXÉCUTÉE** : aucun
navigateur n’était disponible dans la session. Les serveurs réels ont néanmoins
répondu 200 et les preuves DOM, accessibilité, responsive, build, captures et
goldens couvrent le gate de fondation. Cette revue ne valide pas le design final
au nom du Product Owner.

## Processus, Git et intégrité

Les deux serveurs Next lancés pour la revue ont été arrêtés par PID exact. Le
seul daemon Gradle créé par le build a été arrêté avec `gradlew --stop`. Le
constat final ne montre aucun processus Node/Dart/Flutter/Gradle rattaché au
dépôt ; le seul Node restant appartient au runtime Codex, pas au workspace.

Les 68 lignes `REQ-*` restent toutes `Not started` / `Not verified`. Aucune
sécurité métier n’est déclarée opérationnelle.

Fichiers documentaires réellement modifiés :

1. `README.md` ;
2. `docs/roadmap/MVP_EXECUTION_PLAN.md` ;
3. `docs/qa/REQUIREMENTS_TRACEABILITY_MATRIX.md` ;
4. `docs/security/THREAT_MODEL.md` ;
5. `docs/governance/DECISION_LOG.md` ;
6. `docs/qa/SPRINT_0_6_FOUNDATION_GATE_REPORT.md`.

Les validations documentaires finales sont conformes : Prettier passe sur les
six fichiers ; 18 liens Markdown relatifs sont résolus sans manque ; les 20
tests d’outillage passent ; le scanner final passe sur 309 fichiers avec le
manifeste 52/52 ; les 68 exigences restent inchangées ; `git diff --check`
termine avec le code 0. `git fsck --full` termine aussi avec le code 0 et
signale uniquement 22 objets historiques non référencés (11 commits, 8 blobs
et 3 trees), autorisés comme non bloquants. Le head documentaire et les
résultats GitHub Actions sont consignés après publication sans tenter
d’inscrire dans un commit son propre SHA.

## Réserves et risques résiduels

1. build iOS non exécuté sans macOS/Xcode ;
2. Gitleaks indisponible ;
3. Sentry réel non exécuté sans DSN autorisé ;
4. Dependabot Alerts/security updates désactivés et Code Scanning non configuré
   sur GitHub ;
5. navigateur interactif indisponible, avec couverture de substitution bornée ;
6. `npm find-dupes` non concluant après timeout de 300 s, sans insuffisance du
   gate déterministe de topologie ;
7. warning futur Built-in Kotlin de `sentry_flutter` et source map CSS
   `@adminlte/react` absente, sans échec actuel.

Aucune réserve ne concerne un test critique, un build requis sous Windows,
Docker, OpenAPI, le launcher, l’intégrité Git, le contrat de fondation ou les
cinq onglets.

## Verdict

Tous les gates applicables passent. Les contrôles non exécutés et services
externes non actifs sont bornés et déclarés sans faux PASS. S0.6 ne corrige rien
et ne démarre aucune exigence produit.

**S0.6 FOUNDATION GATE EXECUTED — PASS WITH RESERVATIONS — READY FOR CTO REVIEW — SLICE 1 NOT STARTED**
