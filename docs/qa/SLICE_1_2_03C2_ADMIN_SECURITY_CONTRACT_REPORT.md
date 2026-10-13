# Rapport S1.2-03C2-P0 — Admin Security Contract Prerequisite

Statut : **P0/R1/R2/R3/R4 PUBLIÉS DANS LA DRAFT PR #51 AU HEAD
0f607d3965579497ac04a74bd6bd9fb20c876fa6 — R4 CI : INFRASTRUCTURE EN
ÉCHEC, TROIS AUTRES WORKFLOWS EN SUCCÈS — R5 REQUALIFIÉ LOCALEMENT ET EN
PRÉPARATION DE PUBLICATION, NON PUBLIÉ — RUNTIME NON IMPLÉMENTÉ**

Dernière réconciliation : 2026-10-13

## Préflight et bootstrap

Le préflight a confirmé :

- origin/main et le merge C1 exact
  dc97eeef72c4e299988ed19d66460011a8551cf3 ;
- parents ordonnés c97992ca2c82bc4f22f9222ea98ed53714fede4c puis
  f09fce29f43e54f2bf6bba3b043e442df1c94a77 ;
- arbre C1 préservé a4eb9a79da1b676f0037bb547df84b91abb28309 ;
- PR #50 fermée, fusionnée, non Draft, head f09fce29f43e54f2bf6bba3b043e442df1c94a77 ;
- corps final PR #50 de 46 267 octets, SHA-256
  c602bff7a66fcd514575c00ef02c58e114a1e9c2a5fd9fd0ab9d8e4b2e76dae0 ;
- quatre runs push/main, tentative 1, completed/success sur le merge :
  Infrastructure 37778525448, Launcher Windows 37778525505, Security
  37778525338 et Quality Linux 37778525244 ;
- dix worktrees existants propres et préservés, aucune branche, worktree, PR
  ou remote C2/C3 préexistant.

Au moment de cet instantané, le worktree dédié
C:\Users\moham\Music\KORA-PLUS-S1-2-03C2-P0 était créé depuis le merge exact
sur la branche feat/s1-2-03c2-admin-security-contract-prerequisite. La branche
n’avait pas d’upstream. Aucun remote ou PR P0 n’était créé.

## Surface modifiée autorisée

P0 porte sur au plus 17 chemins : six fichiers contractuels existants, huit
documents vivants existants et trois nouveaux documents. Aucun fichier runtime,
Prisma, migration, provisioning, dépendance, lockfile ou workflow n’est
autorisé.

La surface contractuelle finale doit rester à 60 chemins, 67 opérations et 137
schémas, soit 12 opérations C1 et 15 opérations C2. Le généré
packages/contracts/src/generated/audio-pilot.ts est produit uniquement par le
générateur officiel.

## Décisions verrouillées

ADR-026 et le contrat OpenAPI ferment :

- 503 SERVICE_UNAVAILABLE uniforme sur les quinze opérations C2 ;
- matrice par opération : rôles, preuve serveur, purpose step-up, motifs,
  contexte, sinks, action, classe, entité, snapshots et atomicité ;
- reset PASSWORD_RESET strictement distinct de MFA_RECOVERY ;
- neuf POST JSON malformés vers 400 VALIDATION_ERROR et un seul SecurityEvent ;
- notification/outbox, HIBP range fail-closed et e-mails canoniques ;
- idempotence 24 h et invitation de remplacement atomique ;
- trois listes par snapshot authentifié borné ;
- export immuable borné, masking positif et JCS/JWS Ed25519 R4 préservé ;
- bootstrap CLI et identités/ACL PostgreSQL futures sans implémentation ;
- découpage C2a onze opérations + bootstrap, puis C2b quatre opérations.

## Résultats contractuels

| Gate                                        | Résultat                                               |
| ------------------------------------------- | ------------------------------------------------------ |
| Outil Node/npm                              | Node v22.18.0 et npm 10.9.3 conformes                  |
| Installation                                | npm ci --ignore-scripts, 939 packages, code 0          |
| Graphe npm après installation               | npm ls --depth=0, code 0                               |
| OpenAPI                                     | PASS, 60 chemins, 67 opérations, 137 schémas           |
| Mutations adversariales et boundary         | PASS, 317/317                                          |
| Génération exacte                           | PASS, fichier généré courant byte-for-byte             |
| Contracts format/lint/typecheck/tests/build | PASS, tests 8/8                                        |
| Tooling                                     | PASS, 436/436, zéro échec et zéro skip                 |
| Scanner officiel/historique                 | PASS, 388 fichiers, history=true, 52 immuables         |
| Documentation, UTF-8, allowlist et diff     | PASS, 17 chemins exacts, index vide et diff-check vide |

## Essais non comptés comme PASS

Le premier npm ls a été lancé pendant que npm ci terminait encore et a observé
un graphe partiel : code 1, packages extraneous/invalid. Il est
**NON CONCLUSIVE** et n’est pas renommé PASS. Après achèvement confirmé de npm
ci, la reprise npm ls termine au code 0.

Le premier formatage de docs/api/openapi.yaml a laissé Prettier choisir le
parseur YAML d’après l’extension. Le fichier restait YAML mais n’était plus
parsable par JSON.parse, et la génération n’a pas commencé. Le formatage a été
repris avec le parseur JSON explicite.

La première campagne OpenAPI a révélé deux contrôles historiques encore bornés
à C1 : le classificateur générique de réponse 503 et l’ensemble exact des
erreurs download export. Ces deux exécutions restent **NON-PASS**. Les
correctifs causaux ont étendu les contrôles aux seules opérations C2 déjà
contractées; les reprises passent.

Le test boundary initial a aussi interprété les mots normatifs URL/URI de la
politique C2 comme une localisation média. Il reste **NON-PASS**. La reprise
isole la constante normative C2 de cette recherche tout en conservant le
garde-fou sur les opérations et types publics; elle passe.

Le contrôleur documentaire complémentaire initial a d'abord utilisé une clé de
politique mal nommée, puis a traité les paramètres OpenAPI référencés par
`$ref` comme des paramètres inline et a signalé un literal de test de sécurité.
Ces exécutions restent **NON CONCLUSIVE**. Le contrôleur corrigé résout les
références, limite le contrôle ciblé aux signatures de secrets réels et passe
sur les 17 octets finaux sans modifier le contrat.

Une vérification tardive a invoqué par erreur le nom inexistant
`contracts:generate` et termine au code 1 avant toute génération. Elle reste
**NON-PASS**. La commande officielle
`node scripts/openapi/generate-contract-types.mjs --check` a ensuite confirmé
que le fichier généré courant est exact, sans réécriture.

## Runtime et fournisseurs

PostgreSQL, Redis, Docker, HTTP réel, API build, Web, Admin, Flutter, APK,
navigateur et appels fournisseurs sont **NON EXÉCUTÉS**. Aucun runtime C2
n’existe. Notification, HIBP, stockage d’export et clés de production sont
**NON QUALIFIÉS**. La politique OSS reste différée. C3 n’est pas commencé.

## Publication

Dans cet instantané local prépublication du 2026-10-09, P0 était non indexé,
non commité et non publié. Aucun add, commit, push, PR, commentaire, rerun,
Ready, approval, merge, tag, release ou déploiement n’avait été effectué. Toute
publication ultérieure fait foi dans Git et GitHub.

## Diagnostic Infrastructure historique et remédiation R1

Le run Infrastructure `37924510285`, tentative 1, a échoué lors du premier
`docker compose ... start redis` du parcours principal. Le redémarrage Redis
observé ensuite appartient au `finally` et ne démontre pas une récupération du
parcours principal. Le vérificateur assemblait alors l’exception primaire et
les logs API avant de ne conserver que les dix dernières lignes et les 4 000
derniers caractères. L’exception primaire a donc été masquée; son code spawn,
son statut et son signal historiques restent inconnus. La cause de l’échec
Docker historique demeure **NON CONCLUSIVE**.

R1 sépare désormais l’exception principale assainie de la queue assainie des
logs API. Les diagnostics identifient explicitement `main`, `catch` et
`finally`, conservent le code spawn, le statut et le signal lorsqu’ils existent
et distinguent un statut inconnu d’un code numérique. Une erreur du nettoyage
est rapportée séparément et ne peut plus remplacer silencieusement l’erreur
principale. Aucun délai, assertion de santé, ordre fonctionnel, retry Redis,
runtime, fichier Compose ou workflow n’est modifié.

Les preuves locales du 2026-10-10 sont distinctes de toute preuve CI future :

- la reproduction pré-correctif confirme que plus de dix lignes et plus de
  4 000 caractères de logs peuvent masquer l’erreur principale historique ;
- les treize tests ciblés passent, y compris redaction, métadonnées
  spawn/statut/signal et séparation de l’erreur de `finally` ;
- `test:tooling` passe 443/443 ;
- `infra:verify-api` passe au code 0 dans l’instance isolée
  `kora-plus-r1diag-20261010`, avec pannes et récupérations Redis/PostgreSQL,
  reset ciblé, PID API stable et absence de secret ou DSN dans les preuves ;
- l’instance est supprimée, les inventaires Docker étrangers sont inchangés et
  Docker est rendu à son état initial arrêté.

Ces résultats locaux ne requalifient pas l’échec CI historique. La PR #51
reste Draft; aucun succès CI R1 futur n’est affirmé à cet instant. Les
fournisseurs de production restent **NON QUALIFIÉS**, la politique OSS reste
différée et aucun runtime C2/C3 n’est commencé.

## Remédiation locale R2 — causalité typée et durcissement contractuel

Le préflight R2 retrouve exactement le head R1
`07b610886853f858d0c4e2c7ecc7c8730d2fc3ff`, son parent et son arbre, la Draft
PR #51 et son corps de 5 060 octets, les quatre runs R1 au vert, les onze
worktrees propres et la PR #50 fusionnée avec son corps R12 restauré. Aucune
divergence n'a été observée avant édition.

R2 ferme les trois findings de la revue cumulative :

- `AdminAuditLogEntry` conserve les trois contextes historiques et ajoute
  `causationSecurityEventId` sans nouveau schéma. SYSTEM possède exactement les
  branches autonome, délégation administrateur via `AuditLog`, et continuation
  du reset public via `AdminSecurityEvent` ;
- la demande publique, son événement initial et l'outbox restent atomiques. Le
  worker revalide type, action, classe, entité et liaisons serveur; aucun
  identifiant causal, acteur ou délégant ne vient du client ;
- les quinze listes d'erreurs C2 et leurs statuts sont comparés exactement et
  dans l'ordre normatif. Les mutations retrait, ajout, doublon, permutation,
  substitution de même statut et statut incorrect sont refusées ;
- l'exception de `stopChild` est assainie et rapportée comme
  `phase=finally cleanup_error ...; action=stop_api`, sans retry, faux succès ni
  remplacement de l'erreur principale.

La surface reste 60 chemins, 67 opérations et 137 schémas. Prisma, migration,
runtime C1/C2/C3, dépendances, lockfile, workflow, Compose et provisioning ne
sont pas modifiés. Les futures surfaces `app.module.ts` et `app.factory.ts`
devront être autorisées littéralement si le mandat runtime en a besoin.

La première campagne combinée OpenAPI/boundary R2 reste **NON-PASS** à
329/331 : le nouveau helper de fixture ne rejetait pas encore une valeur non
nulle face à `type: null`, ce qui faussait deux assertions de branche. La
correction est limitée à ce contrôle de type; la reprise passe 331/331. Les
résultats techniques finaux observés avant réconciliation documentaire sont :

- OpenAPI 60/67/137 et 39 modèles Prisma préservés ;
- tests adversariaux 324/324 et boundary 8/8 ;
- génération officielle exacte ;
- Contracts format, lint, typecheck, 8/8 tests et build ;
- Infrastructure ciblée 14/14, dont l'injection `stopChild` ;
- `test:tooling` 459/459 ;
- scanner officiel : 388 fichiers, historique actif, 52 sources immuables et
  six scripts d'installation qualifiés.

Deux essais du harnais de preuve restent distincts des gates produit et sont
conservés sans les renommer PASS. Le premier contrôle statique a terminé au
code 1 parce que son `trim()` supprimait l'espace initial de la première ligne
Git porcelain; le contrôle corrigé passe sans changement du gel. Le premier
manifeste PowerShell, bien que valide ligne par ligne, utilisait un ordre de tri
culturel et produisait l'agrégat `f00599e6…`; sa comparaison reste NON-PASS.
Après tri ordinal explicite, les méthodes Node et PowerShell produisent, sur le
gel antérieur à la présente correction documentaire, les mêmes 2 068 octets et
l'agrégat
`782b5e7921c7aaffeff45e2fcf96280cded48f70e910dc39cda5129d17e310df`.

La tentative post-review 034 termine au code 1 avec ses stdout et stderr
capturés vides. Faute de diagnostic archivé dans cette enveloppe, elle reste
**NON CONCLUSIVE** et ne prouve pas que Prettier a démarré. La reprise 035 écrit
les seuls fichiers ciblés, puis le contrôle 036 confirme leur formatage; ces
deux commandes terminent au code 0 et constituent la preuve finale.

L'échec Infrastructure historique reste distinct et sa cause Docker reste
**NON CONCLUSIVE**. Aucun Docker, HTTP réel, PostgreSQL/Redis, build applicatif
ou Flutter n'est exécuté par R2.

## S1.2-03C2-P0-R3 — fermeture locale F1/F2/F3

R3 remplace la projection AuditLog unique par l'union discriminée
`AdminAuditLogEntryV1 | AdminAuditLogEntryV2`. La fixture v1 qualifiée conserve
des identifiants non UUID et des textes historiques de plus de 120 caractères,
rend les métadonnées v2 explicitement nulles et n'expose jamais
`legacyReason`. L'indicateur `legacyReasonRedacted=true` décrit l'omission au
niveau de l'allowlist PostgreSQL. Liste et export emploient la même projection ;
v1 est incluse par défaut et ne correspond jamais artificiellement aux filtres
v2-only.

La table R3 couvre exactement dix producteurs HTTP `AuditLog`, sept
transitions SYSTEM — bootstrap et expiration recovery compris — et sépare les
cinq opérations `NONE`/`AdminSecurityEvent`. Les motifs serveur sont exacts ;
un motif client absent ou invalide après preuve devient
`SECURITY_RESPONSE`/`operatorReason=null`, sans réutilisation du texte client.

`contentSha256` couvre les octets exacts du ZIP final incluant manifeste et
signature, avant chiffrement. La fixture ZIP indépendante a l'empreinte
`0d4f081ba9b3118e0533435becc7f1310266eb12bae03599eac3f38e5d44d79f` ;
le round-trip AES-256-GCM simulé restitue les mêmes octets, tandis que le hash
du manifeste, celui du ciphertext et une mutation d'un octet sont refusés.

La surface R3 est de 60 chemins, 67 opérations et 139 schémas. Les deux
schémas ajoutés nomment les branches v1/v2 ; aucun chemin ou opération n'est
ajouté. R3 ne modifie ni runtime, Prisma, migration, provisioning, dépendance,
lockfile, workflow ou Infrastructure. Les résultats complets et le double
manifeste du gel sont consignés dans le rapport terminal d'exécution ; les
sorties intermédiaires non-PASS restent conservées comme telles.

## Qualification locale R4 — 2026-10-12

| Finding                 | Fermeture contractuelle                                                                                                                                                                                                                                                                                                                            | Régression exécutable                                                                                                   | État         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------ |
| F1 résultat/provenance  | v3 C2 SUCCESS/null ou REJECTED/code fermé par trigger ; enum égal à l'image des mappings ; v1/v2 historique UNKNOWN sans inférence                                                                                                                                                                                                                 | branches valides/invalides, mappings mutés et historique v2                                                             | CLOSED local |
| F2 texte libre          | operatorReason null + indicateur sur v1/v2/v3, stockage non réécrit                                                                                                                                                                                                                                                                                | canaris email, téléphone, secret, texte libre refusés                                                                   | CLOSED local |
| F3 preuve/autorisations | preuve serveur, authz, métier, phases et sinks séparés sur 15 opérations                                                                                                                                                                                                                                                                           | mutations cookie, rôle, step-up, intégrité, pré-preuve                                                                  | CLOSED local |
| F4 sources SYSTEM       | sept prédicats typés, ressource liée par action ; annulations create/role/status + audits SYSTEM dans la transaction initiatrice                                                                                                                                                                                                                   | chaque propriété, égalité de ressource et ensemble sourceAction→transaction mutés                                       | CLOSED local |
| F5 export               | machine fermée, lease/fence/CAS owner, deadline immuable 600 s, trois tentatives initiale incluse, backoff CAS 30/120 s avec révocation owner/lease, reclaim seulement avant deadline, watchdog prioritaire à ou après deadline, PUT stale invisible/orphelin, quatre branches unknown-commit dont PROCESSING à reprise conditionnelle, read lease | six fixtures concurrence + douze retry/deadline + quatre d'éligibilité COMMIT inconnu, audits download/expiry distincts | CLOSED local |
| F6 invitation           | consume + PENDING_MFA + credential Argon2id + préauth 10 min + SecurityEvent atomiques ; livraison cookie inconnue admise ; reprise C1                                                                                                                                                                                                             | cinq failureBoundaryTraces + enveloppe/nextStep                                                                         | CLOSED local |
| F7 historique           | DDL réel consigné, JSONB v1 accepte toute valeur JSON sans borne/forme inventée, overflow explicite sans résultat partiel                                                                                                                                                                                                                          | v1 vide, courte, surlongue, >50 clés, objet imbriqué, tableau et scalaires                                              | CLOSED local |

Le validateur exerce `allOf` en plus des unions exclusives. Le générateur
parenthèse les intersections `allOf` afin que la causalité outcome/failureCode
s'applique aux trois contextes v3, et le boundary test verrouille cette forme.
La surface finale R4 est 60 chemins, 67 opérations et 141 schémas.

Les candidats intermédiaires ne sont pas requalifiés rétroactivement : les
validations OpenAPI 01–07, le contrôle générateur pré-écriture attendu, les
suites OpenAPI 01–02, boundary 01–02 et les passages de formatage rejetés
restent `NON-PASS` dans le ledger append-only avec les empreintes de leurs
sorties. Les PASS ultérieurs attestent uniquement le gel corrigé ; ils ne sont
pas présentés comme le premier essai.

Les deux lacunes historiques — candidats rejetés perdus avant archivage et
sortie PowerShell 5 non capturée — conservent le statut **ACCEPTED WITH CTO
WAIVER — HISTORICAL EVIDENCE ONLY**. Cette dérogation ne couvre aucune preuve
FINAL7, aucun nouvel échec et ne reconstruit aucun artefact absent. Les sept
findings F1–F7 restent fermés par les preuves propres au gel FINAL7.

Ce rapport ne qualifie aucun runtime : PostgreSQL/Redis, Docker, HTTP réel,
Prisma/migration, providers et builds applicatifs sont NON EXÉCUTÉS. Dans
l’instantané prépublication final du 2026-10-13, R4 était local, non indexé,
non commité et non publié ; toute publication ultérieure fait foi dans Git et
GitHub. La cause Docker historique reste NON CONCLUSIVE ; fournisseurs de
production NON QUALIFIÉS, OSS différée, runtime C2/C3 non commencé.

## S1.2-03C2-P0-R5 — qualification locale prépublication du démarrage PostgreSQL

### Préflight et preuve historique

Le préflight du 2026-10-13 retrouve exactement le head, l’upstream et le head
distant `0f607d3965579497ac04a74bd6bd9fb20c876fa6`, son parent
`dc420336d52c791b8876fa30e6ee76f0a5251bea` et l’arbre
`7752a8c01f957fe2d07ff5d9f8b31f01e3f35216`. `origin/main` local et distant
restent `dc97eeef72c4e299988ed19d66460011a8551cf3`; la référence `main` locale
historique reste `a602fd38f32d018867c8a058deace0325b4a7c31`. L’index est vide ;
le worktree courant porte exactement les cinq modifications R5 non indexées
attendues. Onze worktrees sont visibles et aucune opération Git n’est active.
Dans cet instantané historique, le worktree étranger
`KORA-PLUS-S1-2-03A` portait de nombreuses suppressions suivies et n’avait été
ni consulté pour réutilisation, ni modifié, ni nettoyé par R5.

Un mandat séparé a ensuite sauvegardé puis récupéré exactement les 351 chemins
absents de `03A-CLOSURE`, avec 355/355 fichiers suivis conformes et double PASS
indépendant. `03A` et `03A-CLOSURE` ont été déplacés séquentiellement, sans
force, par `git worktree move` vers `Music/KORA-PLUS-WORKTREES/`. Les onze
worktrees restent enregistrés et les dix autres sont propres. Ces opérations
ne déterminent pas la cause des disparitions, qui reste **NON CONCLUSIVE**.

La PR #51 reste `OPEN`, Draft, au head attendu, avec un corps inchangé de
13 518 octets et SHA-256
`045c71a02bd597b4ea1237688d871e727ca21ddd52c9bb3a641c470e07ebe2ea`.
La PR #50 fusionnée est préservée. Les quatre runs R4 restent tentative 1 :
Infrastructure `38382402086` en échec, Launcher Windows `38382402155`,
Security `38382402107` et Quality Linux `38382402133` en succès. Le lockfile
reste inchangé, SHA-256
`a1b9744d0b132e6a2f20809c606b7b7525a17230c147dc6155ec05b5ba4aa2f3`.

Le manifeste d’entrée de la reprise deadline couvre l’état local effectivement
reçu : 634 octets et SHA-256
`bba328e9e338e31488012d1311a616b3e7d5449fcb7e1a229aefb5e9f621dda6`.
Deux implémentations indépendantes, Node et PowerShell avec tri ordinal,
reproduisent les mêmes octets. Les préimages des six fichiers autorisés, les
candidats successifs, les sorties complètes et leurs empreintes sont conservés
append-only dans l’archive externe
`KORA-PLUS-S1-2-03C2-P0-R5-DEADLINE-20261013T115549Z/`.

Le manifeste `1287e96a13820ecec52fed1dda14c6b73b559fba296eda5fb88692f7bc47dd03`
et l’archive `KORA-PLUS-S1-2-03C2-P0-R5-PUBLICATION-20261013T112033Z/`
restent des preuves historiques de la tentative de publication précédente.
Ils ne sont pas des préconditions imposées à cette reprise. Cette tentative
s’est arrêtée avant staging : aucun commit, push ou changement GitHub R5 n’a
été produit.

Une première variante PowerShell du manifeste a été rejetée parce que son tri
de tableaux d’octets n’était pas ordinal. Un premier snapshot de préflight a
également été rejeté parce que PowerShell avait interprété `^{tree}` au lieu de
le transmettre littéralement à Git. Ces candidats restent archivés NON-PASS ;
les reprises ordinales et littérales passent sans recours à la dérogation R4.

Le préflight de publication frais repart du gel unique courant : cinq fichiers,
599 octets et SHA-256
`d439f9bb5ee4485bccccbf58a67982dbb9be04eb7584da03c731bab7eb50c7c0`,
reproduit octet pour octet par Node et PowerShell. Il confirme à nouveau le
HEAD/upstream/distant, les deux références `main`, la PR #51 `OPEN` et Draft
avec son corps inchangé, la PR #50 fusionnée avec son corps restauré, les quatre
runs R4 et le lockfile. Les préimages de cette préparation sont archivées dans
un nouveau dossier externe unique. Ce constat est un gate prépublication ; il
n’affirme aucun succès CI R5 futur.

Le log brut du job `115245793528` est archivé hors Git : 22 442 octets,
SHA-256 `b0a70aefa07038f7f23869ff8fa282ed9fdee53def9a84fd6b834e9640a9a626`.
Il montre l’image épinglée téléchargée, le conteneur créé à
`10:18:41.943Z`, `HISTORICAL_MIGRATIONS_IMMUTABLE_PASS` à
`10:18:43.303Z`, puis `Connection terminated unexpectedly` environ 5 ms plus
tard. Le nettoyage ciblé réussit. `infra:down` échoue ensuite séparément parce
que `infra:prepare` n’a jamais été atteint ; cette panne secondaire reste hors
correction R5.

Le log ne contient aucun log PostgreSQL, état Docker filtré, événement,
restart count ou indicateur OOM. Il ne permet donc pas de distinguer
causalement arrêt normal d’initialisation, crash/OOM, défaut réseau/Docker ou
erreur client. Verdict historique : **NON CONCLUSIVE**.

### Défaut démontré et correction

L’entrypoint extrait de l’image exacte
`postgres:18.4-alpine3.24@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15`
démarre un serveur temporaire avec `listen_addresses=''`, exécute les scripts
d’initialisation, arrête ce serveur, puis exécute le serveur final. L’ancien
wrapper sondait `pg_isready` sans `--host`, donc la socket Unix du serveur
temporaire pouvait autoriser Node avant le chemin réellement utilisé.

La fixture contrôlée de huit secondes observe :

- socket locale prête et TCP PostgreSQL interne `127.0.0.1:5432` indisponible ;
- transport brut sur le port hôte accepté par le proxy Docker, mais connexion
  `pg` authentifiée terminée de façon inattendue ;
- fast shutdown normal du serveur temporaire, puis écoute IPv4 du serveur
  final ;
- `SELECT 1` authentifié réussi et dix sondes stables ;
- conteneur `running`, `OOMKilled=false`, `RestartCount=0`, puis nettoyage
  ciblé.

Cette preuve démontre le défaut du harnais et reproduit le même message client
sous Windows. Elle ne prouve pas que cette race a causé le run Ubuntu.
L’exécution spontanée du wrapper pré-correction passe au code 0 sous Windows ;
l’incident Ubuntu ne s’y reproduit donc pas spontanément.

La correction reste limitée au wrapper et au validateur. Le port publié est
résolu avant Node. Le validateur emploie `performance.now()` et une deadline
dure de 30 000 ms couvrant connexion, authentification, `SELECT 1`, délais de
retry et fermeture des clients rejetés. La fenêtre opérationnelle se termine
à 29 500 ms pour réserver au plus 500 ms de nettoyage dans la même enveloppe ;
chaque tentative est plafonnée à 2 000 ms. `connectionTimeoutMillis` est
recalculé selon le temps restant, avec 25 ms d’avance pour laisser le pilote
signaler l’échec avant le superviseur. `SELECT 1` est transmis sous forme de
chaîne via l’API publique ; aucun `QueryConfig.query_timeout` non public n’est
utilisé.

Sur tout échec ou dépassement, `client.end()` est appelé exactement une fois et
la promesse `connect` ou `query` exacte doit également terminer dans la grâce
publique de 350 ms. Aucun retry ne commence avant ces deux terminaisons. Si
`end` suspend, rejette ou lève synchronement, le chemin devient terminal : un
fallback privé, structurellement gardé et strictement spécifique au pin
`pg@8.22.0`, détruit `client.connection.stream` puis attend son événement
`close` dans le reliquat de l’enveloppe de 500 ms. Toute montée de `pg` impose
donc une requalification. Les promesses perdantes et rejets tardifs conservent
un gestionnaire, ce qui interdit un rejet non géré. Le client qui réussit
`SELECT 1` est exactement celui réutilisé pour la suite. Seule la readiness est
rejouée : aucune migration, base, provision ou mutation n’est lancée avant sa
réussite, et une panne ultérieure ne relance rien.

### Qualification locale et limites

| Contrôle                           | Résultat                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| Ancien résultat deadline           | NON APPLICABLE : 18/18 et 7 822 ms ne couvraient pas les opérations suspendues |
| Candidat deadline 1                | NON-PASS conservé : 24/25, assertion de libération de socket réelle prématurée |
| Candidat deadline 2                | PASS conservé : 25/25 après attente bornée de fermeture                        |
| Candidat deadline 3                | PASS conservé : 26/26 avec `end` appelé même si la deadline est déjà dépassée  |
| Candidat deadline 4                | NON-PASS conservé : 25/28 après ajout des deux fixtures TCP réelles            |
| Candidat deadline 5                | PASS conservé : 28/28 après correction des chemins socket et erreur tardive    |
| Gel technique avant fixture finale | PASS : 28/28, 1 011,9 ms, empreintes `5735…` et `8016…`                        |
| Premier contrôle final             | NON-PASS conservé : 27/28, grâce de 8 ms sensible à l’ordonnancement           |
| Replays ciblés finaux              | PASS puis PASS : 28/28, 1 373 ms puis 1 123 ms, zéro stderr                    |
| Empreintes techniques finales      | Validateur `5735e0e4…`, tests `be2781c5…`                                      |
| PowerShell et Node                 | PASS : parse/check des trois fichiers techniques                               |
| Prettier initial de cette reprise  | NON-PASS conservé avant formatage                                              |
| Prettier final                     | PASS : quatre fichiers ciblés conformes                                        |
| Contrôle statique provisoire       | Seul NON-PASS : la mention transitoire du résultat, autres axes conformes      |
| Wrapper frais final A              | PASS code 0, 80 413 ms, readiness 4 tentatives/823 ms, nettoyage ciblé complet |
| Wrapper frais final B              | PASS code 0, 79 593 ms, readiness 4 tentatives/860 ms, nettoyage ciblé complet |
| Intégration réelle par wrapper     | PASS : 47/47 tests, 12 opérations HTTP, PostgreSQL/Redis réels                 |
| Scanner officiel                   | PASS : 388 fichiers, history=true, 52 immuables, six scripts qualifiés         |

Chaque wrapper exerce PostgreSQL A/B, 39 modèles, 40 tables, quatre
provisionnements, neuf refus ACL, douze opérations HTTP réelles avec
PostgreSQL et Redis réels, puis retire uniquement ses bases, conteneurs,
volume Redis et secrets éphémères. Les preuves R4 restent applicables aux
fichiers contractuels byte-identiques.

Les deux revues indépendantes effectives du gel `d439…` concluent favorablement
sur les deux wrappers 47/47 et les deux replays 28/28, y compris les chemins
`connect`, `SELECT 1` et `end` suspendus, les opérations tardives, l’absence de
retry avant nettoyage et l’archive des preuves. Elles maintiennent le 27/28
NON-PASS, la cause historique NON CONCLUSIVE et le fallback privé strictement
lié à `pg@8.22.0`. Après la présente adaptation documentaire, deux conclusions
seniors doivent encore porter sur le nouveau gel final avant indexation.

Docker était initialement arrêté et inaccessible. Le dossier `run`, qui ne
contenait que deux points de réanalyse de 0 octet, a été préservé par renommage
avant le démarrage. L’inventaire de référence du replay final comptait 4
conteneurs, 5 volumes et 5 réseaux. Les séquences d’identifiants observées après
A sont identiques à cette référence ; celles observées après B sont identiques
à A. Aucun résidu R5 n’est donc visible dans ces inventaires. Le démarrage
initial de la campagne avait recréé le seul réseau intégré `bridge` ; les
réseaux utilisateur, conteneurs et volumes étrangers observés ont conservé
leurs identités.

Docker a ensuite été arrêté. Le premier contrôle de restauration a vu un
processus CLI transitoire ; le contrôle stabilisé suivant en observe zéro,
l’empreinte de configuration égale celle de la préimage et le répertoire
généré est absent. Les deux sockets sauvegardés sont de nouveau observés sous
`run` avec les noms, attributs, tailles et horodatages consignés. Cette preuve
de sortie ne prétend pas une identité indépendante au-delà de ces propriétés
observées.

R5 modifie cinq fichiers existants autorisés, sans ajout, suppression,
renommage ou changement de mode suivi. Aucun runtime C2/C3, Prisma, migration,
provisionneur, contrat, workflow, Compose, dépendance, lockfile ou timeout
applicatif n’est modifié ; la surface reste 60 chemins, 67 opérations et 141
schémas. Dans ce nouvel instantané prépublication, R5 reste local, non indexé,
non commité et non publié ;
aucun SHA, arbre ou Run ID R5 futur n’est affirmé. Aucun `git add`, commit,
push, rerun, édition de PR, Ready, approval, merge, tag, release ou déploiement
n’a été effectué. La PR #51 reste Draft et son corps inchangé. Fournisseurs
**NON QUALIFIÉS**, politique OSS différée, incident Redis distinct
**NON CONCLUSIVE**, runtime C2/C3 non commencé.
