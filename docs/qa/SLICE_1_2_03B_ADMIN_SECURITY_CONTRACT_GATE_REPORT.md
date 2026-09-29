# Rapport S1.2-03B — Admin Security Contract Gate

Date : 2026-09-28

Branche : `feat/s1-2-03b-admin-security-contract-gate`

Baseline : `09e64c889231cfa57cf68cb44cdf05ae47ad356d`

Arbre baseline : `94cb165f651c1ccc2f06297e7c8024e3570a2ce8`

Statut : **INSTANTANÉ HISTORIQUE PRÉPUBLICATION DU 2026-09-29 — VALIDÉ LOCALEMENT — TROIS CONTRE-REVUES PASS — AUCUNE PUBLICATION GIT À CET INSTANT**

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

## Diff exact — 16 fichiers

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

## Remédiation locale S1.2-03B-R1 — 2026-09-29

### Baseline et cause

R0 est publié au commit
`a1002b37b26feb456e2b11df87c20e671c4c20ae`, parent
`09e64c889231cfa57cf68cb44cdf05ae47ad356d`, arbre
`b498fa36321fe8887a11796dfd69934abe504bc2`, avec 16 fichiers et
`+7933/-1142`. La PR #48 est toujours ouverte, Draft, non fusionnée et sa
description indique « CI en attente ». Infrastructure `36572630270`, Launcher
Windows `36572630257` et Quality Linux `36572630225` ont réussi. Security
`36572630278` a échoué sur quatre avis : `GHSA-qw65-cvwx-89v3`,
`GHSA-58mr-gqgx-xq4g`, `GHSA-hrr3-gc8f-f4qj` et
`GHSA-3pph-fpjx-jg34`.

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

### Validations exécutées

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
