# Rapport S1.2-03B — Admin Security Contract Gate

Date : 2026-09-28

Dernière réconciliation documentaire : 2026-10-01

Branche : `feat/s1-2-03b-admin-security-contract-gate`

Baseline : `09e64c889231cfa57cf68cb44cdf05ae47ad356d`

Arbre baseline : `94cb165f651c1ccc2f06297e7c8024e3570a2ce8`

Statut : **R4 VALIDÉ LOCALEMENT LE 2026-10-01 — ÉTAT DE PUBLICATION ET DE CI
COURANT DANS GIT/GITHUB — PR #48 DRAFT NON FUSIONNÉE**

## Instantané historique R0 prépublication — 2026-09-29

## Résultat

Le contrat OpenAPI contient exactement 60 chemins et 67 opérations : les 34
chemins / 40 opérations historiques et 26 chemins / 27 opérations Admin
Security. Les nouvelles opérations sont réparties en 12 `S1.2-03C1` et 15
`S1.2-03C2`. ADR-025 est enregistré sous `docs/adr/` sans modifier le Resolution
Pack immuable.

Aucun runtime, contrôleur, service, worker, schéma Prisma, migration, seed,
interface, dépendance, manifeste, lockfile ou workflow n'a été ajouté ou
modifié. Aucun `git add`, commit, push, PR, merge, tag, release ou déploiement
n'a été exécuté.

## Diff exact historique R0 — 16 fichiers

L'inventaire final comprend 13 fichiers suivis modifiés et 3 nouveaux fichiers
non suivis, tous dans l'allowlist S1.2-03B.

| Fichier                                                           | Changement                                                                                                                        |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `docs/api/openapi.yaml`                                           | 27 opérations, politiques, schémas, erreurs et headers Admin Security ; cinq retraits `SUPPORT` historiques strictement autorisés |
| `packages/contracts/src/generated/audio-pilot.ts`                 | frontière TypeScript régénérée, unions audit/recovery strictes et métadonnées des 27 opérations                                   |
| `scripts/openapi/generate-contract-types.mjs`                     | matérialisation des unions et des métadonnées sécurité, audit, rate limit, query et Fetch Metadata                                |
| `scripts/openapi/validate-openapi.mjs`                            | inventaires exacts, validation fail-closed et politiques ADR-025                                                                  |
| `scripts/openapi/validate-openapi.test.mjs`                       | inventaires et 45 mutations adversariales S1.2-03B                                                                                |
| `packages/contracts/test/boundary.test.mjs`                       | frontières générées, unions strictes, répartition 12/15 et absence de secrets                                                     |
| `packages/contracts/README.md`                                    | usage et limites du contrat généré                                                                                                |
| `docs/architecture/SLICE_1_2_03B_ADMIN_SECURITY_CONTRACT_GATE.md` | architecture, inventaire C1/C2 et décisions de sécurité                                                                           |
| `docs/adr/ADR-025-admin-auth-session-audit-contexts.md`           | contextes et preuves d'audit, sessions, récupération, export et séquençage                                                        |
| `docs/governance/SPEC_ALIGNMENT_REGISTER.md`                      | séparation Resolution Pack / décisions post-pack et réconciliation audit/export                                                   |
| `docs/governance/DECISION_LOG.md`                                 | décision locale S1.2-03B et hors-périmètre                                                                                        |
| `docs/governance/SOURCE_OF_TRUTH.md`                              | autorité ADR-025 sous `docs/adr/` et état local non publié                                                                        |
| `docs/qa/REQUIREMENTS_TRACEABILITY_MATRIX.md`                     | exigences SEC-ADM-01 à SEC-ADM-14                                                                                                 |
| `docs/roadmap/MVP_EXECUTION_PLAN.md`                              | 03B validé localement ; runtimes 03C1/03C2 et interface 03C3 non commencés                                                        |
| `docs/security/THREAT_MODEL.md`                                   | menaces et contrôles contractuels Admin Security                                                                                  |
| `docs/qa/SLICE_1_2_03B_ADMIN_SECURITY_CONTRACT_GATE_REPORT.md`    | présent rapport et preuves                                                                                                        |

## Contrôles contractuels verrouillés

- TOTP RFC 6238 HMAC-SHA-256, six chiffres, pas de 30 secondes, fenêtre ±1 et
  rejet du replay ; secret 256 bits chiffré par enveloppe AES-256-GCM avec AAD,
  version de clé et rotation via un gestionnaire de clés externe.
- QR POST `image/png` livré une seule fois, `no-store` et `nosniff`, sans seed
  ni URI de provisioning dans JSON, logs ou audit.
- Mot de passe Argon2id (64 MiB, trois itérations, parallélisme 1) traité comme
  octets UTF-8 exacts sans normalisation Unicode, avec contrôle de compromission.
- Récupération sans création de session ; contexte `MFA_RECOVERY`, révocation
  des anciennes sessions, ré-enrôlement TOTP et exactement dix codes ; dossier
  approuvé avec approbateur non nul. Sans ajouter de 28e route, un dossier
  `PENDING` est annulé atomiquement et audité s'il est remplacé ou devient
  inéligible.
- Reset manuel opaque CSPRNG 128 bits, sans URL ni oracle, révoquant les sessions
  tout en préservant TOTP et codes de récupération ; erreurs publiques génériques
  et timing comparable pour login, reset et invitation.
- JWT RS256 15 min ; inactivité 8 h ; absolu 12 h ; step-up 5 min ; maximum trois
  familles ; refresh opaque 256 bits one-shot en cookie protégé. Les jetons
  pré-auth, d'enrôlement et de récupération MFA expirent après 10 min, le reset
  après 15 min et l'invitation après 24 h.
- RBAC deny by default, audit/exports super-admin uniquement, révocation tierce
  avec step-up et raison, no self-change et protection du dernier super-admin.
- Exactement quatre profils de rate limit : password 5/900 s, TOTP 5/300 s,
  refresh 10/60 s et recovery 5/3600 s ; chaque `429` porte `Retry-After`.
- Login protégé par Origin exact, Fetch Metadata et temps comparable ; pré-auth
  et refresh en AND cookie + `X-Kora-CSRF`; bearer `adminSession`; JSON strict et
  idempotence exacte.
- Audit ADR-025 avec classes `LOGIN`, `SESSION`, `EXPORT` et `BUSINESS` : preuve
  acteur/sujet, entité, avant/après masqués, request ID et causalité. Chaque
  opération désigne explicitement le sink de succès et d'échec ; tout échec sans
  contexte prouvé rejoint `AdminSecurityEvent`. Un `SYSTEM` autonome garde
  causalité/délégant nuls ; une délégation exige les deux. Mutation métier et
  `AuditLog` sont atomiques.
- Filtres audit ADR-004 complets en conjonction : acteur, action, type/id entité,
  bornes temporelles, curseur et limite. Les exports ZIP sont PII-redacted, sans
  URL signée, avec manifeste RFC 8785 JCS, JWS détaché Ed25519, trust bundle,
  rotation chevauchante et couverture bijective des seules entrées payload à
  chemins sûrs, sans circularité, surplus, manque ni doublon.
- Rétention append-only sans suppression tant que la durée légale/produit n'est
  pas arbitrée ; bootstrap super-admin one-shot CLI différé au runtime C2.

## Tests adversariaux

Les 45 mutations S1.2-03B rejettent notamment : substitution ou ajout de
chemin/méthode/opération, slice C1/C2 incorrecte, `2XX` générique, succès
multiple, statut/media/schema substitué, enveloppe ouverte, AND changé en OR,
CSRF ou Origin absent, Fetch Metadata affaibli, rôle élargi,
step-up/idempotence retiré, header QR absent, fuite de seed, création de session
par récupération, code interne de replay exposé, XOR audit affaibli, preuve ou
filtre audit manquant, sink audit absent, rate limit ou `Retry-After` absent,
approbateur nullable sur un dossier approuvé, export non signé, oracle
d'invitation, mauvais sink d'échec, perte d'annulation recovery, causalité
`SYSTEM` fictive, algorithme de signature affaibli, ensemble payload non
bijectif, timing reset absent et réintroduction de `SUPPORT`.

## Résultats de validation

| Gate                                            | Résultat                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Validateur OpenAPI/Prisma cible inchangé        | PASS — 60 chemins, 67 opérations, 137 schémas, 18 invariants hérités, 33 modèles inchangés |
| Tests OpenAPI + boundary                        | PASS — 269/269                                                                             |
| Comparaison générée byte-for-byte               | PASS — Prettier 3.9.6 exact                                                                |
| Contracts format                                | PASS                                                                                       |
| Contracts lint                                  | PASS                                                                                       |
| Contracts typecheck                             | PASS                                                                                       |
| Contracts tests                                 | PASS — 6/6                                                                                 |
| Contracts build                                 | PASS                                                                                       |
| Root `test:tooling`                             | PASS — 349/349                                                                             |
| Security scan                                   | PASS — 358 fichiers, historique inclus, 52 sources immuables                               |
| Références Markdown / chronologie / traçabilité | PASS                                                                                       |
| Recherche secrets et caractères de contrôle     | PASS                                                                                       |
| `git diff --check`                              | PASS                                                                                       |
| Allowlist                                       | PASS — exactement 16 chemins, aucun domaine runtime/migration/interface                    |

Les dépendances verrouillées déjà présentes dans la racine active
`KORA-PLUS-FINAL` ont été utilisées au moyen d'une jonction locale temporaire ;
aucune installation et aucun changement de manifeste/lockfile n'ont eu lieu.

Les validations runtime, base de données/migration et navigateur/interface sont
**NON EXÉCUTÉES** parce que ces domaines sont explicitement hors périmètre et
absents de ce lot contract-only ; elles ne sont pas déclarées PASS.

## Revues indépendantes en lecture seule

Les trois premières revues ont rendu `FAIL` sur les mêmes lacunes matérielles :
filtres et preuves d'audit incomplets, XOR acteur nullable dans la génération,
sink pré-session non défini, protections Fetch Metadata/rate limit/no-store
incomplètes, paramètres TOTP/TTL imprécis, export et recovery insuffisamment
contraints, et séquençage C3 erroné. Tous ces constats ont été corrigés dans les
16 fichiers autorisés puis couverts par validateur et mutations adversariales.

La seconde contre-revue a rendu `PASS` sur les axes API Contract et Data/Audit.
L'axe Admin Security a encore relevé le routage conditionnel des échecs, le
timing reset/invitation, la transition d'annulation, la causalité système
autonome et le format cryptographique du manifeste. Ces cinq constats ont été
réconciliés sans nouvelle route : tables exactes de sinks/timing, machine d'état
recovery serveur, union autonome/déléguée et manifeste JCS/JWS Ed25519. Les
validations techniques complètes ont ensuite été rejouées.

L'ultime revue Admin a isolé une circularité dans la formule « chaque entrée du
ZIP ». Le manifeste couvre désormais bijectivement l'ensemble trié des seules
entrées payload, exclut `manifest.json` et `manifest.sig`, impose des chemins
relatifs NFC sûrs et rejette toute entrée manquante, supplémentaire ou
dupliquée. Une mutation dédiée verrouille cette correction.

| Revue          | Portée                                                              | Résultat               |
| -------------- | ------------------------------------------------------------------- | ---------------------- |
| Admin security | TOTP, sessions, CSRF, recovery, RBAC, audit, secrets                | `PASS — LECTURE SEULE` |
| API contract   | inventaires, statuts, media, enveloppes, extensions, génération     | `PASS — LECTURE SEULE` |
| Data/audit     | ADR-025, XOR SQL futur, acteur/sujet, raisons, absence de migration | `PASS — LECTURE SEULE` |

Dans cet instantané historique prépublication du 2026-09-29, les trois verdicts
indépendants sont `PASS`, la décision de commit restait explicitement réservée
au CTO et ce rapport n'autorisait encore aucune publication Git.

## Instantané historique local prépublication S1.2-03B-R1 — 2026-09-29

### Baseline et cause

R0 est publié au commit
`a1002b37b26feb456e2b11df87c20e671c4c20ae`, parent
`09e64c889231cfa57cf68cb44cdf05ae47ad356d`, arbre
`b498fa36321fe8887a11796dfd69934abe504bc2`, avec 16 fichiers et
`+7933/-1142`. La PR #48 est toujours ouverte, Draft, non fusionnée et sa
description indique « CI en attente ». Infrastructure `36572630270`, Launcher
Windows `36572630257` et Quality Linux `36572630225` ont réussi. Security
`36572630278` a explicitement imprimé trois avis :
`GHSA-qw65-cvwx-89v3`, `GHSA-58mr-gqgx-xq4g` et
`GHSA-3pph-fpjx-jg34`. Le diagnostic R1 du graphe R0 a aussi confirmé
`GHSA-hrr3-gc8f-f4qj` ; cet avis ne doit pas être attribué au texte du log
Security R0.

R1 fait passer la résolution physique `fast-uri` sous `ajv@8.18.0` de 3.1.6
à 3.1.8, tout en conservant la déclaration parente `^3.0.1`. La résolution
`multer` sous `@nestjs/platform-express@11.1.28` passe de 2.3.0 à 2.4.0, avec
la déclaration parente `2.2.0` inchangée. Le scanner refuse désormais toute
version 3.x de `fast-uri` `>=3.0.0 <3.1.8`, avec preuves causales pour 3.1.6 et
3.1.7, ainsi que Multer 2.x `>=2.2.0 <2.4.0`, dont 2.3.0. Le nouveau graphe
Multer retire causalement `concat-stream` et `typedarray`; aucun autre drift de
version n’est introduit.

### Reproductibilité et sept artefacts WASM

Deux `npm ci --ignore-scripts` sous Node 22.18.0 et npm 10.9.3 reproduisent le
même graphe et le même SHA-256 de `package-lock.json`. `npm ls --all` et sa
sortie JSON retournent 0, sans paquet `invalid` ni peer cassée, mais affichent
textuellement les sept nœuds `extraneous` suivants :

1. `node_modules/@emnapi/core@2.0.0-alpha.3` ;
2. `node_modules/@emnapi/runtime@2.0.0-alpha.3` ;
3. `node_modules/@emnapi/wasi-threads@2.0.1` ;
4. `node_modules/@img/sharp-wasm32@0.35.4` ;
5. `node_modules/@napi-rs/wasm-runtime@1.2.0` ;
6. `node_modules/@tybys/wasm-util@0.10.3` ;
7. `node_modules/@img/sharp-wasm32/node_modules/@emnapi/runtime@1.11.3`.

Les sept réapparaissent à l’identique après chaque installation. Leurs entrées
du lockfile sont `optional` et préexistaient dans R0. Elles sont atteignables
uniquement par des branches optionnelles de plateforme : bindings `wasm32`,
Sharp `freebsd-wasm32` ou `webcontainers`, puis leurs dépendances Emscripten.
Aucun de ces nœuds n’est `fast-uri`, `multer` ou leur parent ; aucune de leurs
entrées n’apparaît dans le diff R1. Cette sortie textuelle n’est donc pas
présentée comme vide : elle est qualifiée non bloquante, non causée par R1,
sous réserve des contre-revues finales.

### Preuves locales R1 exécutées

- audits npm complet et production : 0 vulnérabilité ;
- `npm audit signatures` : code 0, 1 130 paquets avec signature de registre et
  198 attestations vérifiées, sans signature ou attestation invalide ;
- licences : 1 132 paquets, 0 non déclarée, 0 non approuvée ;
- scanner ciblé : 79/79 ; tooling : 353/353 ; scanner officiel : PASS sur 358
  fichiers, historique inclus, et 52 sources immuables ;
- OpenAPI : 60 chemins, 67 opérations, 137 schémas ; 263/263 tests et
  génération contractuelle inchangée ;
- API : format, lint, typecheck, 7 suites/27 tests et build réussis ; aucun
  usage direct de Multer et aucun endpoint multipart ajouté ;
- monorepo : environnement, validation CI, format, lint, typecheck, tests et
  builds applicables réussis, dont 22 tests Flutter et l’APK debug ; build iOS
  **NON EXÉCUTÉ** sur l’hôte Windows faute de Xcode ;
- launcher Windows : processus enfant au code 23 correctement refusé ;
- infrastructure isolée : lifecycle PostgreSQL/Redis, frontière runtime,
  persistance/reset ciblé, santé API, pannes et récupérations Redis/PostgreSQL
  réussis sans redémarrage API ni fuite de secret. Les ressources temporaires
  isolées ont ensuite été supprimées.

R1 ne modifie aucun octet OpenAPI, contrat généré, runtime Admin, Prisma,
migration, workflow ou interface. La capacité produit reste celle de R0 et
S1.2-03C1/C2/C3 demeurent `Not started`. R1 est local, non indexé, non commité
et non publié. Aucun SHA, arbre ou Run ID R1 futur n’est affirmé ; une décision
CTO distincte reste requise avant tout commit ou changement de la PR #48.

## Réconciliation postpublication S1.2-03B-R2 — 2026-09-29

### Publication R1 vérifiée

R1 est publié au commit
`3c1e0a067c1c977dcc7a85e4baa892ebdcc0b82e`, parent direct
`a1002b37b26feb456e2b11df87c20e671c4c20ae`, arbre
`c87ca8400af2e421931533e2e6b6853680360800`, avec le message
`fix(security): remediate S1.2-03B supply-chain findings`. Son diff porte sur
10 fichiers et `+358/-78`. L'empreinte agrégée de la publication R1 est
`8298eb4de428fa578ed34af3f5ce0f5d80979ea02f124f78a3f8a603d3bbf659`.

La chronologie des avis est conservée sans réécriture : Security R0
`36572630278` a explicitement imprimé `GHSA-qw65-cvwx-89v3`,
`GHSA-58mr-gqgx-xq4g` et `GHSA-3pph-fpjx-jg34`. Le diagnostic R1 a confirmé
que le graphe R0 était également affecté par `GHSA-hrr3-gc8f-f4qj`. Les
résolutions R1 `fast-uri@3.1.8` et `multer@2.4.0` ferment les quatre avis.

### Provenance des preuves

Les preuves locales R1 sont les deux installations reproductibles, les 1 130
signatures de registre et 198 attestations vérifiées sans élément invalide,
l'inventaire local de licences 1 132/0/0, la qualification des sept artefacts
WASM optionnels ainsi que les validations API, Flutter et Infrastructure déjà
détaillées dans l'instantané historique ci-dessus.

Les preuves issues des workflows R1 publiés sont distinctes : audits npm
complet et production à zéro vulnérabilité, inventaire CI de licences
1 139/0/0, scanner officiel sur 358 fichiers avec historique actif et 52
sources immuables, et lockfile déterministe. `npm audit signatures` n'est pas
attribué à la CI.

| Workflow         | Run ID        | Événement / état                    |
| ---------------- | ------------- | ----------------------------------- |
| Security         | `36642550938` | `pull_request/completed/success` R1 |
| Infrastructure   | `36642550943` | `pull_request/completed/success` R1 |
| Launcher Windows | `36642550958` | `pull_request/completed/success` R1 |
| Quality Linux    | `36642551010` | `pull_request/completed/success` R1 |

### État historique et frontière R2

Au head R1, la PR #48 restait ouverte, Draft, `MERGEABLE` et non fusionnée. Son
cumul vérifié était de 2 commits, 20 fichiers et `+8291/-1220`. Le contrat
publié restait inchangé à 60 chemins, 67 opérations et 137 schémas. Il ne
livrait aucun runtime, modèle, migration ou interface ; S1.2-03C1, S1.2-03C2
et S1.2-03C3 restaient `Not started`.

R2 réconcilie uniquement les six documents autorisés et ne modifie aucun octet
technique. Son état de publication fait foi dans Git et GitHub ; aucun SHA ni
Run ID R2 futur n'est anticipé dans ce rapport. Aucun passage Ready, merge,
tag, release, déploiement ou démarrage S1.2-03C n'est autorisé par R2.

## S1.2-03B-R3 — Instantané historique local prépublication — 2026-10-01

### État publié R2 et cause exacte

R2 est publié au commit documentaire
`6bc344c4eca7065089a6f6af6a9d47a98bf76b0f`, parent
`3c1e0a067c1c977dcc7a85e4baa892ebdcc0b82e`, arbre
`55a00c1c03d5e5142f81c0f99398d0686ec1a04b`. Il porte exactement six
documents, `+271/-74`, avec l'empreinte agrégée
`431100164b601a9b5b95586160c6e42591ce353b9d9d1d641145e1a987bc3e87`.
Le cumul publié de la PR #48 est de 3 commits, 20 fichiers et `+8488/-1220`.

| Workflow         | Run ID        | État R2                          |
| ---------------- | ------------- | -------------------------------- |
| Infrastructure   | `36707322816` | `pull_request/completed/success` |
| Security         | `36707322818` | `pull_request/completed/failure` |
| Quality Linux    | `36707322868` | `pull_request/completed/success` |
| Launcher Windows | `36707322988` | `pull_request/completed/success` |

Security a terminé l'installation puis a échoué à `Audit dependency trees`,
code 1. Le graphe complet de développement contenait
`minimatch@10.2.6 > brace-expansion@5.0.9`. L'audit a remonté les trois avis
suivants :

- `GHSA-q2hr-2g5m-vwhr` / `CVE-2026-102277`, medium, correctif 5.0.12 ;
- `GHSA-qhr7-859c-m2p7` / `CVE-2026-102278`, high, correctif 5.0.11 ;
- `GHSA-6j4f-fj2g-mc7p` / `CVE-2026-102276`, high, correctif 5.0.10.

Les six documents R2 n'ont modifié ni manifeste ni lockfile. La comparaison
avec Security R1 vert `36642550938` prouve une évolution de l'information
d'audit fournie par le registre/advisory database, pas un effet des octets R2,
une dérive de résolution ou un échec de signature/licence. Les étapes scanner,
OpenAPI et déterminisme du lockfile n'ont pas été exécutées après l'échec R2.

### Correctif R3 et alerte Next distincte

R3 remplace l'override exact `brace-expansion@5.0.9` par 5.0.12. Le seul parent
physique reste `minimatch@10.2.6`, avec la déclaration `^5.0.8` inchangée. Le
scanner refuse les intervalles vulnérables complets des branches 0/1, 2, 3, 4
et 5.0, y compris leurs bornes et préversions.

La qualification effectuée après R2 a aussi identifié une alerte Next.js
distincte. `next@16.3.4` est remplacé par 16.3.8 dans Admin et Web, et
`eslint-config-next@16.3.4` par 16.3.8 dans Admin, Web et UI. Next 16.3.8 ferme
le critique `GHSA-vcvr-r3jv-pc5j` et les sept avis publiés avec cette release :
`GHSA-cjq9-62q9-8jv4`, `GHSA-f87g-xv8r-7p7x`,
`GHSA-4jqv-mc3x-m676`, `GHSA-mcj8-r9mp-w47p`,
`GHSA-3w37-wq28-93x7`, `GHSA-h694-7cp9-m8p3` et
`GHSA-39w2-rjm5-chcv`. `@next/env`, `@next/eslint-plugin-next` et les huit
paquets `@next/swc-*` sont tous alignés sur 16.3.8.

| Candidate                   | Licence | Engines                   | Intégrité npm                                                                                     | Provenance vérifiée                          |
| --------------------------- | ------- | ------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `brace-expansion@5.0.12`    | MIT     | `20 \|\| >=22`            | `sha512-YovQ3rzhaLMIrDjNDMkNS01tea93qhEhG5xy8f6+R0l+dw3Ki+5sCoIoI942iuLZTHWogWktgwVDhU09iNEimQ==` | registre npm, 2 signatures                   |
| `next@16.3.8`               | MIT     | Node `>=20.9.0`           | `sha512-U7QEZaTini6wKrb8A8hqLLqYQyCetegKjCpJOyxk642vWoMoU1x5PyZCJFvgYgiptA8xc5j/9xYlZFO7w9Sjmw==` | registre npm, 2 signatures, attestation SLSA |
| `eslint-config-next@16.3.8` | MIT     | non déclaré par le paquet | `sha512-81vovwMe6NGnoFsl0KUJWzlS+y239i3fdsxs49gSEX3pDQW2cuKy+fxUPXNkQqqx6OCPheYPtBlSufc9aZ0k+w==` | registre npm, 2 signatures, attestation SLSA |

Les remédiations R1 `ajv@8.18.0 > fast-uri@3.1.8` et
`@nestjs/platform-express@11.1.28 > multer@2.4.0` sont conservées.

### Lockfile causal et reproductible

Le lockfile final est généré exclusivement par npm 10.9.3 sous Node 22.18.0.
Des essais intermédiaires ont été rejetés parce qu'ils conservaient des copies
imbriquées des candidates ou introduisaient des deltas transitifs non causaux.
La génération retenue a été reproduite dans un staging non-Git isolé puis
adoptée sans édition manuelle.

Le diff ne contient aucun ajout ni retrait de nœud. Il change exactement 13
versions physiques : `brace-expansion`, `next`, `eslint-config-next`,
`@next/env`, `@next/eslint-plugin-next` et huit paquets `@next/swc-*`. Les
métadonnées de workspaces Admin, Web et UI sont alignées. Deux
`npm ci --ignore-scripts` ajoutent 1 138 paquets, en auditent 1 145 et
conservent le SHA-256 du lockfile :
`3bbb2e4b476decf50a7165143c985719d234e9511deebf757a6c9527eb68c03a`.

`npm ls --all` retourne 0. Ses sept entrées textuelles restent exactement les
artefacts WASM optionnels historiques déjà qualifiés en R1 ; leurs nœuds et
parents sont inchangés par rapport à HEAD R2. Elles ne sont ni supprimées ni
utilisées pour masquer un échec.

### Validations locales effectives

| Contrôle                                   | Résultat R3                                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| audits npm complet et production           | code 0, zéro vulnérabilité                                                                                                      |
| `npm audit signatures`                     | code 0 au troisième essai, 1 130 signatures et 198 attestations ; les essais `ECONNRESET`/`EIDLETIMEOUT` restent non conclusifs |
| licences                                   | 1 132 paquets installés, 0 licence non déclarée, 0 non approuvée                                                                |
| scanner ciblé / tooling / scanner officiel | 88/88 ; 362/362 ; 358 fichiers, historique actif, 52 sources immuables et 5 scripts d'installation qualifiés                    |
| format / lint / typecheck                  | racine au code 0 ; Flutter inclus                                                                                               |
| tests npm                                  | Web 10/10, Admin 13/13, API 27/27, Contracts 6/6, Config 1/1, UI 11/11                                                          |
| tests Flutter                              | l'orchestrateur racine a rencontré un refus d'accès au lock du cache SDK après les suites npm ; relance ciblée code 0, 22/22    |
| builds                                     | Web/Admin Next 16.3.8, API, Contracts, Config, UI et APK debug au code 0 ; iOS non exécuté sur Windows                          |
| natifs Next                                | SWC Windows 16.3.8 chargé ; Sharp 0.35.4 exécuté en mémoire                                                                     |
| Flutter deps                               | graphe lisible au code 0 ; aucun manifeste ni lock Flutter modifié                                                              |
| OpenAPI et contrat                         | 60 chemins, 67 opérations, 137 schémas ; génération courante ; OpenAPI/contrat/`next-env.d.ts` byte-identiques à HEAD R2        |

Le SHA-256 du contrat généré avant et après génération reste
`ef40a5ec43aa3deb63a64ca980436f2a9cb40e2cd108106a9ca5f2f21f92bac0`.
Aucun runtime, modèle Prisma, migration, workflow, OpenAPI, contrat généré ou
interface n'est modifié par R3.

À la date de cet instantané, R3 était local, non indexé, non commité et non
publié. Aucun SHA ni Run ID R3 futur n'était affirmé. La PR #48 était `OPEN`,
Draft et non fusionnée ; aucun rerun, changement de PR, Ready, merge, tag,
release ou déploiement n'avait été effectué. S1.2-03C1, S1.2-03C2 et
S1.2-03C3 restaient `Not started`. Après cet instantané, l'état de publication
et de CI fait foi dans Git et GitHub.

## S1.2-03B-R4 — Audit Export Signature Contract and Governance Reconciliation

Qualification : **instantané local prépublication du 2026-10-01**.

### Baseline publiée R3

R3 est publié au commit
`1a6c4efeb169e89ccf989004559f4e0c1af80af3`, parent direct R2
`6bc344c4eca7065089a6f6af6a9d47a98bf76b0f`, arbre
`031101296c44d18d7f1a2ab1f917ac1432023f6d`, message
`fix(security): remediate brace-expansion and Next.js advisories`, avec 13
fichiers et `+893/-117`.

| Workflow         | Run ID        | État R3, tentative 1             |
| ---------------- | ------------- | -------------------------------- |
| Infrastructure   | `36894241121` | `pull_request/completed/success` |
| Launcher Windows | `36894240862` | `pull_request/completed/success` |
| Security         | `36894240870` | `pull_request/completed/success` |
| Quality Linux    | `36894241013` | `pull_request/completed/success` |

Avant la publication R4, la PR #48 était `OPEN`, Draft, `CLEAN` et non
fusionnée. Son head et son upstream valaient le commit R3, sa base était
`09e64c889231cfa57cf68cb44cdf05ae47ad356d`, et son cumul publié était de 4
commits, 23 fichiers et `+9342/-1298`. Le SHA-256 du corps de PR était
`b103546d26756e2a61378a6738a50ef3e23a562a23eac303b910966271fcb97b`.

### Deux findings CTO résolus

1. Le contrat appelait `signatureInput` les seuls octets UTF-8 du manifeste
   canonisé. R4 distingue le payload JCS UTF-8, le signing input RFC 7515 ASCII
   `BASE64URL(protected).BASE64URL(payload)` sans padding, et la sérialisation
   détachée `protected..signature`. L'en-tête protégé contient exactement
   `alg=EdDSA` et `kid=signatureKeyId`; le profil `b64=false` est interdit. Le
   trust bundle et la rotation existants sont inchangés.
2. Des blocs R1/R2 historiques portaient encore des titres ou champs
   « courants ». Ils conservent leurs chiffres et preuves, mais sont désormais
   explicitement historiques ; l'état courant de publication et de CI fait foi
   dans Git et GitHub.

La preuve cryptographique Ed25519 indépendante accepte le signing input JWS
standard, reconstruit le payload détaché, refuse une signature calculée sur le
seul payload, et refuse l'altération de l'en-tête protégé, du payload ou un
profil `b64=false`. Les mutations contractuelles refusent également l'ancienne
valeur de signing input et une sérialisation attachée contradictoire.

### Validations locales effectives R4

| Contrôle                  | Résultat R4                                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| OpenAPI                   | 60 chemins, 67 opérations, 137 schémas, 18 invariants hérités et 33 modèles cibles inchangés                      |
| génération TypeScript     | byte-identique après réécriture ; SHA-256 `b3a62e0522d9ca0b8df582f0b9c23e712f0af4953941eadbd500f477f4396c3a`      |
| tests OpenAPI + boundary  | 274/274 ; preuve JWS et mutations contradictoires incluses                                                        |
| package Contracts         | format, lint, typecheck, 6/6 tests et build au code 0                                                             |
| `test:tooling`            | 367/367 au code 0                                                                                                 |
| Prettier ciblé            | 13/13 fichiers conformes ; parser JSON explicite pour `openapi.yaml`                                              |
| documentation et encodage | 8/8 documents sans lien cassé ; chronologie valide ; 13/13 UTF-8 sans BOM, LF final et sans caractère de contrôle |
| scanner officiel          | 358 fichiers, historique actif, 52 sources immuables et 5 scripts d'installation qualifiés                        |
| scope et whitespace       | allowlist exacte 13/13 ; aucun ajout ; `git diff --check` au code 0                                               |
| lockfile                  | inchangé, SHA-256 `3bbb2e4b476decf50a7165143c985719d234e9511deebf757a6c9527eb68c03a`                              |
| audits npm frais          | complet et production au code 0 ; zéro vulnérabilité                                                              |

Deux écarts intermédiaires ont été corrigés et leurs contrôles affectés
rejoués : le premier test combiné comptait 273/274 à cause d'une expression
régulière de boundary qui ne tolérait pas le retour à la ligne déterministe de
Prettier ; une première passe Prettier sans parser explicite a ensuite traité
`openapi.yaml` comme YAML. La forme JSON du dépôt a été restaurée avec le parser
JSON, la génération revalidée byte-for-byte et les 274 tests rejoués au vert.
Aucun échec n'est masqué.

`npm audit signatures`, l'inventaire de licences, les builds Web/Admin/API/UI,
Flutter, l'APK et PostgreSQL ne sont pas rejoués : R4 ne modifie ni dépendance,
ni lockfile, ni fichier applicatif, mobile ou base de données. Les preuves
historiques R3 restent intactes : les
deux incidents réseau de signatures demeurent `NON CONCLUSIVE`, le troisième
essai reste le succès retenu, le premier `npm test` global interrompu par le
lock du cache Flutter reste distingué de la relance 22/22, et iOS reste non
exécuté sous Windows.

Dans cet instantané du 2026-10-01, R4 était local, non indexé, non commité et
non publié. Aucun SHA, arbre, Run ID ou succès CI R4 futur n'y était affirmé ;
aucun git add, commit, push, rerun, changement de PR, Ready, approval, merge,
tag, release ou déploiement n'avait été effectué. Après cet instantané, l'état
de publication et de CI fait foi dans Git et GitHub. Les neuf worktrees sont
préservés et S1.2-03C1/C2/C3 restent `Not started`.
