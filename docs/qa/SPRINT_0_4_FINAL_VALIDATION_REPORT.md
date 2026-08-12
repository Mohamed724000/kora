# KORA+ — Rapport de validation finale Sprint 0.4

Date : 2026-08-12
Branche : `chore/s0-4-local-infrastructure`
Parent autorisé : `bf4f0520bbc588c66721f5751cb21f24f3c8401f`
Statut : **VALIDATION FINALE PASS — PRÊT POUR REVUE CTO**

## Verdict exécutif

La remédiation supply-chain npm est acceptée et reste conforme : graphe valide,
audits complet et production à zéro, licences conformes et versions corrigées
exactes.

L'instabilité du test d'intégration API est préexistante à cette remédiation.
Le test faisait porter le timeout Jest normal de cinq secondes sur la création
complète de l'application Nest et sur la première requête HTTP. Les occurrences
historiques n'ont toutefois pas été instrumentées : les preuves disponibles ne
permettent pas de localiser exactement le dépassement entre `NestFactory.create`,
`app.init()` et la requête HTTP.

La correction déplace uniquement ce setup dans un `beforeAll` déterministe doté
d'un timeout local de 10 secondes. Les tests et les requêtes conservent leur
timeout normal. Aucun retry, délai artificiel, `forceExit`, changement global,
suppression d'assertion ou modification de production n'a été introduit.

La décision CTO de durcissement ciblé accepte explicitement l'absence de cause
racine détaillée comme dette documentée. Elle qualifie la candidate comme une
mesure de robustesse bornée, et non comme une correction causale définitive.
Après sa réintroduction byte-for-byte, les trois validations ciblées et les
deux exécutions globales finales passent sans timeout ni processus orphelin.
Tous les gates applicatifs et supply-chain passent ; les preuves infrastructure
et sécurité sont réutilisables sur des fichiers, dépendances, images et digests
strictement identiques.

Verdict supply-chain rectifié :

`S0.4 NPM SUPPLY-CHAIN REMEDIATION PASSED — S0.5 NOT STARTED`

Verdict final :

`S0.4 LOCAL INFRASTRUCTURE IMPLEMENTED — READY FOR CTO REVIEW — S0.5 NOT STARTED`

## Préflight

| Contrôle                              | Résultat                                          |
| ------------------------------------- | ------------------------------------------------- |
| Branche                               | PASS — `chore/s0-4-local-infrastructure`          |
| HEAD                                  | PASS — `bf4f0520bbc588c66721f5751cb21f24f3c8401f` |
| `origin/main`                         | PASS — même commit                                |
| Index                                 | PASS — vide                                       |
| Branche distante S0.4                 | PASS — absente                                    |
| PR S0.4                               | PASS — absente                                    |
| Sauvegarde externe                    | PASS — archive présente et empreinte inchangée    |
| Versions npm corrigées                | PASS                                              |
| Audits npm                            | PASS — zéro vulnérabilité                         |
| Dix fichiers techniques S0.4 protégés | PASS — empreintes inchangées                      |
| S0.5                                  | PASS — non commencé                               |

Sauvegarde antérieure à la remédiation :

- archive :
  `C:\Users\moham\AppData\Local\Temp\kora-s04-npm-remediation-20260812-105904.zip` ;
- SHA-256 :
  `853d8ac254dc661cbebd331407d0f09b7baffc9520164fde8c11ff2db0b170b8`.

### Réconciliation « trois fichiers » / « deux Review changes »

Les trois fichiers annoncés après la remédiation étaient `package.json`,
`package-lock.json` et le présent rapport. Les deux premiers étaient des
fichiers suivis et apparaissaient dans `git diff`. Le rapport était non suivi ;
il apparaissait dans `git status` et `git ls-files --others`, mais pas dans
`git diff`. Il n'y avait donc aucune divergence de contenu.

Empreintes enregistrées au préflight :

| Fichier                  | SHA-256                                                            |
| ------------------------ | ------------------------------------------------------------------ |
| `package.json`           | `adfa6a04ddc1912136f57be8fc12a7e6c7324e2a0a3486ca712fbd3343703875` |
| `package-lock.json`      | `24e531da03478e89ad35c369f2fd497d32174038a6e9d9f9663396ee531cd400` |
| rapport avant diagnostic | `c0c739b14746858cc0900aeabd2bd6447fbd4521fc31c53687e201392f998b3f` |

Le lockfile contenait bien les correctifs attendus :
`brace-expansion@5.0.9`, `fast-uri@3.1.5`, `js-yaml@3.15.1`,
`js-yaml@4.3.1` et `nanoid@3.3.17`. `minimatch` restait en `10.2.6`.

## Historique des deux timeouts

Deux occurrences du même timeout Jest de cinq secondes sont connues :

1. une occurrence pendant le diagnostic du launcher, avant la remédiation npm ;
2. une occurrence pendant la première revalidation du launcher, après la
   remédiation npm, dans
   `démarre en test sans connexion externe et expose la liveness`.

Lors de la seconde occurrence, Web a terminé 7/7 mais a lui-même nécessité
44,71 secondes, Admin a terminé 10/10, puis l'API a fini à 17/18 en
54,601 secondes. Le launcher a correctement propagé le code global 1 et n'a
laissé aucun orphelin. Cette lenteur simultanée hors API, ainsi que l'occurrence
antérieure à la remédiation, excluent un changement comportemental causé par
les cinq patches supply-chain.

## Diagnostic mesuré

Les traces de diagnostic ont utilisé `performance.now()`, horloge monotone, et
ont été entièrement retirées du dépôt avant validation.

Cinq reproductions ciblées conservées ont toutes réussi. Les phases mesurées
sur le premier test étaient :

| Phase                                  |    Minimum |    Maximum |
| -------------------------------------- | ---------: | ---------: |
| Initialisation du graphe Nest          |  11,266 ms |  31,441 ms |
| `NestFactory.create` total             | 153,245 ms | 285,024 ms |
| Création hors initialisation du graphe | 135,426 ms | 264,340 ms |
| `createApplication` total              | 166,648 ms | 311,112 ms |
| Première requête HTTP                  |  31,203 ms |  52,485 ms |
| Fermeture finale                       |   1,463 ms |   4,265 ms |

Une mesure affinée distincte a confirmé :

- initialisation du graphe Nest : 17,530 ms ;
- création hors graphe : 175,525 ms ;
- `app.init()` : 6,164 ms ;
- requête HTTP : 45,746 ms ;
- fermeture : 1,605 ms.

Le test injecte deux probes de readiness factices ; il n'ouvre aucune
connexion PostgreSQL ou Redis. Les connexions BullMQ sont `lazyConnect`. Une
exécution complète de l'API sous `--detectOpenHandles` a passé 18/18 en
8,081 secondes sans handle signalé.

### Cause racine détaillée non déterminée

Les reproductions réussies démontrent que la création de l'application et son
nettoyage fonctionnent normalement, sans dépendance externe ni handle bloqué.
Le périmètre du timeout historique est également établi : le démarrage complet
était exécuté dans le corps du premier `it`, avec la première requête, sous la
limite normale de cinq secondes.

La contention de l'hôte Windows est une hypothèse forte, cohérente avec les
44,71 secondes du Web lors du second incident, mais elle n'a pas été mesurée
pendant une occurrence API en échec. Les cinq reproductions instrumentées ont
toutes réussi. Il est donc impossible d'affirmer si les cinq secondes ont été
dépassées dans `NestFactory.create`, `app.init()` ou la requête HTTP. La cause
exacte reste non déterminée. La décision CTO du présent durcissement accepte
expressément cette limite rétrospective ; la contention Windows demeure une
hypothèse plausible, non prouvée.

Trace externe des cinq reproductions :

- `C:\Users\moham\AppData\Local\Temp\kora-s04-api-diagnostic-baseline.log` ;
- SHA-256 :
  `6a2b2c08ab775c9baf093c6174b253b7d79aa2b76c73cd4412e4691afc5b656b`.

## Historique et réintroduction du durcissement

La candidate modifie uniquement `apps/api/test/app.integration.spec.ts` :

- le premier appel à `start(...)` a été déplacé du corps du premier test vers
  un `beforeAll` ;
- ce seul hook d'initialisation reçoit un timeout explicite de 10 000 ms ;
- le premier test ne contient désormais que la requête et ses assertions ;
- `afterAll` conserve la fermeture garantie de l'application ;
- les redémarrages des autres scénarios conservent la fermeture préalable.

Le plafond local de 10 secondes est inférieur à la limite CTO de 30 secondes.
Les mesures normales du démarrage atteignent au plus 311 ms ; le budget accru
n'est donc pas une affirmation de durée nominale, mais une marge de robustesse
explicitement arbitrée pour une contention environnementale exceptionnelle.
Un blocage durable reste détecté après 10 secondes. Les tests et requêtes
conservent leur budget normal.

La candidate initiale avait été intégralement évaluée, puis retirée conformément
à la décision précédente qui exigeait encore une cause détaillée démontrée. La
nouvelle adjudication CTO autorise sa réintroduction comme durcissement borné.
La version finale possède exactement l'empreinte de la candidate évaluée :
`6eeaf24883413f1cc2b2872fe3695b35acb7d0e99e5a511fa4816d1aaebfd8ce`.

Diff fonctionnel : quatre lignes modifiées, sans fichier de production,
configuration Jest, manifeste, launcher ou infrastructure changé.

## Évaluation initiale complète de la candidate

### Dix exécutions ciblées

Commande :

`npm test --workspace @kora-plus/api -- test/app.integration.spec.ts --runTestsByPath`

| Exécution | Résultat   | Temps Jest | Temps processus |
| --------: | ---------- | ---------: | --------------: |
|         1 | PASS — 9/9 |    5,637 s |         7,029 s |
|         2 | PASS — 9/9 |    5,719 s |         7,052 s |
|         3 | PASS — 9/9 |    5,113 s |         6,533 s |
|         4 | PASS — 9/9 |    6,022 s |         7,362 s |
|         5 | PASS — 9/9 |    6,293 s |         7,565 s |
|         6 | PASS — 9/9 |    6,262 s |         7,497 s |
|         7 | PASS — 9/9 |    5,983 s |         7,316 s |
|         8 | PASS — 9/9 |    5,925 s |         7,234 s |
|         9 | PASS — 9/9 |    6,475 s |         7,780 s |
|        10 | PASS — 9/9 |    6,726 s |         7,864 s |

Trace externe SHA-256 :
`b3c893b328e57ab344c45d957637056609e93a5d52aea28350f9663c981a4ae7`.

### Launcher et exécutions globales

| Contrôle                                          | Résultat                                           |
| ------------------------------------------------- | -------------------------------------------------- |
| `node --test scripts/run-workspace-task.test.mjs` | PASS — 2/2                                         |
| Enfant code 23                                    | PASS — message conservant `code 23`, code global 1 |
| `node scripts/run-workspace-task.mjs test`        | PASS — 48/48, code 0, 28,290 s                     |
| Premier `npm test`                                | PASS — 48/48, code 0, 26,556 s                     |
| Second `npm test`                                 | PASS — 48/48, code 0, 29,639 s                     |
| Processus orphelins                               | PASS — aucun après chacune des trois exécutions    |

Chacune des trois exécutions globales a produit : Web 7/7, Admin 10/10,
API 18/18, Contracts 1/1, Config 1/1, UI 4/4 et Flutter 7/7.

Les PID avant/après contenaient uniquement le processus Java préexistant
`43084`. Les traces globales ont respectivement pour SHA-256 :

- direct : `8b5e0afe6829dff50c70bae1bd87c7bc8ebe70ea75b28eb28665e8bb2fb8d70e` ;
- npm 1 : `3ea061f389b90ee4143fd99bb72ea5d924041f95ab1b47c6ff8421fe05c3d0ad` ;
- npm 2 : `ec37c63cad7171ed0b9fa2c9667b8d981ca3ef55f1d566b74ebb3e5f1f192f35`.

Le warning Vite sur la source map absente d'`@adminlte/react` reste non
bloquant et n'affecte aucun résultat.

### Revalidation finale après adjudication CTO

La candidate réintroduite étant byte-for-byte identique, le protocole réduit
autorisé a été exécuté sur l'état final :

| Contrôle                  | Résultat                                        |
| ------------------------- | ----------------------------------------------- |
| Test ciblé 1              | PASS — 9/9, code 0, 5,209 s Jest                |
| Test ciblé 2              | PASS — 9/9, code 0, 5,560 s Jest                |
| Test ciblé 3              | PASS — 9/9, code 0, 4,713 s Jest                |
| Tests dédiés launcher     | PASS — 2/2                                      |
| Enfant code 23            | PASS — code 23 conservé, code global 1          |
| Launcher direct           | PASS — 48/48, code 0, 25,204 s                  |
| `npm test` supplémentaire | PASS — 48/48, code 0, 23,222 s                  |
| Processus orphelins       | PASS — aucun après les deux exécutions globales |

Les deux relevés PID contenaient uniquement le PID Java préexistant `43084`
avant et après l'exécution. Aucun timeout ou échec d'assertion n'a été observé.

## Gates applicatifs finaux

| Gate                    | Résultat                                            |
| ----------------------- | --------------------------------------------------- |
| Format global           | PASS — code 0, 54,644 s, aucun fichier Dart modifié |
| Lint global             | PASS — code 0, 145,432 s                            |
| Typecheck global        | PASS — code 0, 19,237 s                             |
| Test global final       | PASS — 48/48, code 0, aucun orphelin                |
| Build global            | PASS — code 0, 45,464 s                             |
| Build API ciblé         | PASS — code 0                                       |
| APK Flutter debug ciblé | PASS — code 0                                       |
| Build iOS               | `NON EXÉCUTÉ — ENVIRONNEMENT WINDOWS SANS XCODE`    |

Le lint s'est terminé naturellement ; Flutter analyze a signalé zéro issue.
Aucun timeout API ou test en échec n'a été relancé.

## Supply-chain et licences finales

| Contrôle                      | Résultat                                             |
| ----------------------------- | ---------------------------------------------------- |
| `npm ls --all --json`         | PASS — aucun problem, extraneous, invalid ou missing |
| `npm audit --json`            | PASS — 0 vulnérabilité                               |
| `npm audit --omit=dev --json` | PASS — 0 vulnérabilité                               |
| Licences                      | PASS — 1 092 paquets, 0 non déclarée                 |

`package.json` et `package-lock.json` conservent exactement les empreintes du
préflight ; aucune nouvelle modification supply-chain n'a été introduite.

## Infrastructure et routes de santé

| Contrôle           | Résultat                                                                       |
| ------------------ | ------------------------------------------------------------------------------ |
| `infra:status`     | PASS — PostgreSQL et Redis healthy                                             |
| `infra:check`      | PASS — smokes sans fuite                                                       |
| `infra:verify`     | PASS — persistance, reset ciblé, idempotence, ressources étrangères inchangées |
| `infra:verify-api` | PASS — code 0, PID API stable, aucun orphelin                                  |

Les validations lifecycle/API précédemment réussies sont réutilisées selon la
décision CTO : `package.json`, `package-lock.json`, `compose.yaml`,
l'entrypoint Redis et les quatre scripts infra conservent exactement leurs
empreintes ; les deux images et digests sont identiques ; un `infra:status`
final confirme PostgreSQL et Redis healthy sur les seuls ports loopback.

`infra:verify-api` confirme :

- `/health/live` et `/health/ready` à 200 en état nominal ;
- `/api/v1/health/live` et `/api/v1/health/ready` à 404 ;
- liveness maintenue et readiness à 503 pendant chaque panne Redis/PostgreSQL ;
- reprise à 200 sans changement du PID API `15204` ;
- reset ciblé et ressources Docker étrangères inchangées ;
- aucune fuite de credential local ou DSN brut.

## Images Docker

Docker Scout 1.20.4 a été exécuté sur Linux/amd64 avec le filtre
Critical/High et `--exit-code`, sans VEX local, suppression ou option
`--ignore-suppressed`.

| Image                        | Index OCI                                                                 | Manifeste Linux/amd64                                                     | Résultat                                                  |
| ---------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------- |
| PostgreSQL `18.4-alpine3.24` | `sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15` | `sha256:b6a16ed0eb96e2c362811f7eeb951eac8b459e7b40be4149ea5444aa7c65569b` | 1 Critical / 16 High, code 2 — adjudication CTO inchangée |
| Redis `7.2.15-alpine3.21`    | `sha256:05a97a479bc73de66f087dc05b569010772880f778cc8671fa6b8aadee32e5c6` | `sha256:8d3740a7d506644b6553d6175e7a7e7028b9cda8493a6c9825a251b574426cf9` | 0 Critical / 0 High, code 0                               |

Les 17 findings PostgreSQL sont les mêmes findings de la stdlib Go embarquée
dans `gosu` déjà acceptés. Scout annonce quatre exceptions disponibles côté
service, mais elles n'ont pas été utilisées.

## Intégrité, secrets et Git

| Contrôle                        | Résultat                                        |
| ------------------------------- | ----------------------------------------------- |
| Manifeste immuable              | PASS — 52/52                                    |
| Scan haute confiance de secrets | PASS — 277 fichiers, 3 candidats, 0 secret réel |
| Fichiers sensibles interdits    | PASS — 0                                        |
| Fichiers supérieurs à 50 MiB    | PASS — 0                                        |
| Gitleaks                        | NON EXÉCUTÉ — outil indisponible                |
| `git diff --check`              | PASS — code 0                                   |
| `git fsck --full`               | PASS — aucune corruption                        |
| Objets dangling                 | 5 blobs et 3 arbres, sans référence ni impact   |
| Index avant publication         | vide                                            |
| S0.5                            | non commencé                                    |

Les trois candidats du scan sont un template DSN dans `prisma.config.ts` et
deux fixtures explicitement factices dans les tests de readiness PostgreSQL et
de logger structuré. Après adjudication, aucun secret réel n'est présent.

## Empreintes finales du périmètre technique

| Fichier                                 | SHA-256                                                            |
| --------------------------------------- | ------------------------------------------------------------------ |
| `README.md`                             | `09c8402fec3a2f18b4eaefff4f30f7a27914aa2911608a19248d6ddd7405b65e` |
| `package.json`                          | `adfa6a04ddc1912136f57be8fc12a7e6c7324e2a0a3486ca712fbd3343703875` |
| `package-lock.json`                     | `24e531da03478e89ad35c369f2fd497d32174038a6e9d9f9663396ee531cd400` |
| `apps/api/test/app.integration.spec.ts` | `6eeaf24883413f1cc2b2872fe3695b35acb7d0e99e5a511fa4816d1aaebfd8ce` |
| `.gitignore`                            | `fae54bc827021f0ffa3082a80de20b431471e630da69ec8e411d0207307fc8bc` |
| `infra/README.md`                       | `dc12967f6449fbf6e624828f7661e80a2bfa6069bdafe0b618445a557bc71b78` |
| `scripts/run-workspace-task.mjs`        | `02fbf7a78b1bc55d309684dd60b4cb1135bad24fdbae3fcb7bec45306205fbb9` |
| `infra/compose.yaml`                    | `dac282f9bfd9fa69837b2fb53c7e0f1e42d913ca473c853ad1e06fa7db6ab30a` |
| `infra/redis/entrypoint.sh`             | `a9d048b4df92e48f2556793607a60722f9f71d449b232df986a6aff7594e2087` |
| `scripts/infra/cli.mjs`                 | `b11360e6f6785b15d61dda37c9ff728a2edbb4f13735f14cb7356c67756a79ff` |
| `scripts/infra/lib.mjs`                 | `2da58a96e402d3ea7d3835f15ddb3fd9b409e3896d4bf0562e76bd31df356547` |
| `scripts/infra/verify-api-health.mjs`   | `5e1a3370f287bc61c7ec979d106c2901789e3bb5c363facb81d4c06f16367ddd` |
| `scripts/infra/verify-lifecycle.mjs`    | `1c0ffadd542b4e164c916b321aa41b71c0c9343cc757f26d0c2380dc9f92642a` |
| `scripts/run-workspace-task.test.mjs`   | `9891fed4c0307485b19f0c222be0199803fe49f86c3479ea418947f6e7a4eaf2` |

Les dix fichiers techniques protégés conservent exactement leurs empreintes de
référence. Le seul changement sous `apps/**` ou `packages/**` est la candidate
autorisée dans le test d'intégration API ; aucun fichier de production ne
change.

## Revues indépendantes

### 1. Équivalence fonctionnelle et cycle de vie

Verdict : **PASS**, aucun finding bloquant.

La revue confirme l'empreinte exacte `6eeaf248…`, les 9 blocs `it`, 26 appels
`expect`, 10 routes et le même nombre d'appels à `start()` avant/après. Le
`beforeAll` initialise une seule fois, `afterAll` ferme l'application et les
redémarrages ferment l'instance précédente. Aucun code de production,
timeout global, retry, sleep, `forceExit`, `skip` ou `only` ne change.

### 2. Timeout local, stabilité, handles et processus

Verdict : **PASS AVEC RÉSERVES**, aucun finding bloquant.

La revue confirme le budget de 10 secondes strictement local au hook, les trois
nouveaux runs 9/9, les deux runs globaux 48/48 et l'absence d'orphelins. Une
revalidation indépendante supplémentaire sous `--detectOpenHandles` passe
18/18 en 5,563 secondes, sans handle signalé et sans nouveau PID.

Réserves non bloquantes : les métadonnées PID/code ne sont pas incluses dans
les mêmes fichiers que les sorties fonctionnelles ; les huit redémarrages de
scénario conservent volontairement leur budget normal ; le launcher ne garantit
pas le nettoyage d'un arbre après interruption forcée. La cause détaillée des
incidents historiques reste indéterminée, dette expressément acceptée.

### 3. Supply-chain, infrastructure, Git et documentation

Verdict : **PASS AVEC RÉSERVES**, aucun finding bloquant.

La revue confirme le graphe npm, les audits à zéro, les 1 092 licences, les
empreintes package/infra, les services healthy en loopback, les images/digests
et rescans attendus, le manifeste 52/52, le périmètre Git autorisé et l'absence
de S0.5. Le rapport distingue correctement cause inconnue et durcissement borné.

Réserves non bloquantes : Gitleaks est indisponible et les traces `%TEMP%` sont
éphémères.

## Publication

Le commit, le push et la draft PR restent conditionnés à trois revues sans
finding bloquant et à une dernière inspection intégrale du diff staged.

La fusion, le passage en Ready, les tags, releases et déploiements restent
interdits. S0.5 n'a pas commencé.
