# S1.2-03C2a — rapport de qualification des fondations runtime admin

## Statut

**C2a INTÉGRÉ DANS MAIN AU MERGE
`029e30bbc795f3d9c153782bc04e45e9f5a03f8a`, NON DÉPLOYÉ. C2b EST UN
CANDIDAT LOCAL DISTINCT ET N'EST PAS QUALIFIÉ TERMINALEMENT.**

Docker Desktop/Linux Engine est disponible depuis Codex et reste démarré.
La campagne PostgreSQL isolée est concluante. L'avenant ciblé aligne désormais
le validateur OpenAPI sur exactement 48 modèles Prisma : 39 historiques et neuf
C2a. Les précédents NO-GO Docker et le premier NON-PASS OpenAPI/tooling restent
historiques et ne sont pas requalifiés.

Le résultat C2a est intégré dans l'arbre `a32f8332e80c18c565521418fe197619f8fb56d9`
du merge main `029e30bbc795f3d9c153782bc04e45e9f5a03f8a`. Les instantanés R9 et
R10+R11 décrits plus bas restent des états historiques prépublication. Aucun
tag, release ou déploiement n'est acquis.

## Périmètre observé

Le changement cumule l'allowlist Foundations/P0 préexistante et l'allowlist
métier P1–P9 autorisée. Il monte localement les onze opérations HTTP C2a, les
workers notification/expiration et le bootstrap stdin, sans modifier les
surfaces protégées ni ajouter de dépendance, lockfile ou workflow. C2b et C3
sont **NON COMMENCÉS**. Fournisseurs de production **NON QUALIFIÉS** et
politique OSS différée.

## Fondations implémentées

- Modèle et migration des resets, recovery cases, invitations,
  préautorisations, événements, outbox, snapshots et bootstrap.
- Contraintes différées d'atomicité et de causalité pour les créations,
  expirations, acceptations BUSINESS, annulations et remplacements, avec
  provenance INSERT `xid8` immuable sous UPDATE.
- Exécuteur transactionnel R6 avec bornes, sérialisation callback,
  `ReadyForQuery` causal, validation des commandes terminales et disposition
  du client exactement une fois.
- Quatre rôles PostgreSQL et quatre secrets distincts, ACL exactes incluant
  namespace, multiplicité et grantor propriétaire, et refus des surfaces
  directes ou `PUBLIC` non prévues.
- Validation isolée avec redaction des secrets, scénarios positifs et
  adversariaux, migrations A/B, contamination et nettoyage contrôlé.

## Preuves acquises avant gel reviewer

Les captures hors dépôt séparent stdout, stderr, code de sortie, commande,
horodatages, tailles et SHA-256. Les versions d'outils apparaissent uniquement
dans les sorties qui les émettent explicitement. Les derniers contrôles ciblés
sont réussis :

- validation Prisma ;
- typecheck API ;
- tests unitaires C2a ;
- format et lint API ;
- syntaxe Node du validateur ;
- syntaxe Bash du provisioner ;
- analyse PowerShell du wrapper.

Les échecs antérieurs restent conservés sans requalification : première
capture `npm ci` orpheline et NON CONCLUSIVE, tentatives historiques du
manifeste PowerShell, échecs de format/typecheck/tests corrigés par des
captures ultérieures. La perte de préimage du helper de manifeste v2 reste un
finding P2 ; le helper n'est ni reconstruit ni réécrit.

Deux répertoires de tentative incomplets restent individuellement
**NON CONCLUSIVE** et ne sont utilisés par aucun verdict :
`20261014T135630342Z-api-typecheck-r6-refactor-e76d3a2b0e91` et
`20261014T135633673Z-api-c2a-unit-tests-r6-refactor-2be8ea7195ee`.

## Revues et actions correctives

Les premières revues Architecture, Infrastructure et Governance ont conclu
BLOCK. Les corrections locales couvrent notamment l'ACL
`delegatedByAdminUserId`, la comparaison d'ACL exacte, les cas BEGIN/rollback,
la sérialisation RFQ, la validation de commande, les contraintes atomiques et
de remplacement, la causalité des annulations, le pliage ASCII, la redaction
des secrets et le nettoyage/inventaire Docker. Le second cycle corrige aussi
`PREPARE TRANSACTION`, les invariants atomiques bidirectionnels, les transitions
expirées, la provenance transactionnelle de l'utilisateur invité et les ACL
homonymes hors `public`. Ces corrections doivent encore être revues ensemble
sur un manifeste frais byte-identique.

Le gel `cdf89beef2ce8dec42e7c2296c139d2117c18279542e1db8cfc3f480b78286cf`
a ensuite été invalidé par de nouveaux P1 reviewer, sans Docker : classe LOGIN
au lieu de BUSINESS pour l'acceptation, provenance `xmin` contournable par
no-op UPDATE, événement de succès isolable, montage de sept secrets Compose
incompatible avec le validateur C1, et ACL ne liant pas le grantor. Le présent
cycle corrige ces points par provenance INSERT immuable, trigger inverse,
montages fichiers C2a séparés, `EXCEPT ALL` et attestation du grantor
propriétaire. Un nouveau gel et trois nouvelles conclusions restent requis.

Le gel
`1b81b2b583811566b0186216914dea50dbbc841946020d7c27611528905be3bf`
a lui aussi été invalidé avant Docker : les triggers inverses d'acceptation et
de reset filtraient la classe attendue dans leur condition d'activation, ce
qui permettait à un succès de classe incorrecte d'éviter l'atomicité. Les
triggers couvrent désormais tout succès de l'action concernée et valident la
classe contractuelle dans le bundle ; deux fixtures adversariales dédiées ont
été ajoutées. Ce gel BLOCK reste une preuve historique et ne sera pas réutilisé.

## Contrôles encore requis

1. Produire deux manifestes indépendants byte-identiques avec des helpers
   versionnés à création exclusive.
2. Obtenir trois conclusions GO en lecture seule sur exactement ce gel.
3. Exécuter une seule validation PostgreSQL 18.4/Docker isolée, puis vérifier
   son nettoyage et son postflight.
4. Exécuter les gates applicables finales sans installation ni modification
   du lockfile.
5. Actualiser ce rapport, produire le manifeste final et faire confirmer les
   conclusions finales sur les mêmes octets.

PostgreSQL réel, Docker, migrations A/B, contamination, ACL runtime et
nettoyage sont donc **NON EXÉCUTÉS** à ce stade. Le verdict demeure **NO-GO**
jusqu'à acquisition de toutes les preuves ci-dessus.

## Avenant de reprise Docker du 2026-10-14

L'avenant CTO a autorisé un nouveau démarrage de Docker Desktop/Linux Engine et
une nouvelle campagne PostgreSQL isolée. Avant toute action Docker, le gel
technique a été reproduit depuis les octets présents par les helpers Node et
PowerShell v4 déjà archivés : les deux sorties sont byte-identiques, comptent
396 entrées et 47 368 octets, et portent le SHA-256
`c47244154c85bff3f4a7210e3bd2fe2e55a6d7b6ad9650dd441f99b33712763c`.
HEAD, arbre HEAD, index vide, 22 chemins allowlistés et diff
`+10 898/-53` correspondent au préflight autorisé. Les douze worktrees sont
présents ; les onze autres sont propres et leurs HEAD enregistrés sont
inchangés.

L'état initial archivé observait : aucun processus Docker Desktop/backend,
service `com.docker.service` `Stopped/Manual`, contexte `desktop-linux`, et
`docker version` comme `docker info` au code 1. Leur erreur concrète est :
`failed to connect to the docker API at
npipe:////./pipe/dockerDesktopLinuxEngine` puis
`The system cannot find the file specified`.

Le lancement direct de Docker Desktop n'a laissé aucun processus observable.
La commande officielle bornée `docker desktop start --timeout 120` n'a pas
clos son collecteur après la borne et a été interrompue ; son répertoire
d'intention, stdout et stderr reste conservé **NON CONCLUSIVE**, sans métadonnée
finale inventée. Les sept sondes `docker version` suivantes ont toutes échoué
au code 1 sur le même pipe absent. La tentative ciblée de démarrage du service
manuel a échoué au code 1 avec : `Cannot open com.docker.service service on
computer '.'`.

Conformément à la condition d'arrêt, le wrapper PostgreSQL n'a pas été invoqué.
Aucun répertoire secret C2a, conteneur, réseau, volume ou image cible n'a été
créé par cette reprise. L'inventaire Docker persistant reste **NON CONCLUSIVE**,
car le daemon n'a jamais été joignable. Le postflight retrouve aucun processus
Docker Desktop/backend, le service `Stopped/Manual`, aucun répertoire secret
C2a et les mêmes échecs `docker version`/`docker info` au code 1 : l'état Docker
initial est restauré.

La tentative historique
`20261014T155332652Z-c2a-authorized-single-postgresql-docker-validation-3452f8120a2b`
reste **NON-PASS — DAEMON INDISPONIBLE — AUCUNE RESSOURCE CRÉÉE** et n'est pas
requalifiée. La présente reprise est également **NON-PASS — DAEMON
INDISPONIBLE — AUCUNE RESSOURCE CRÉÉE**. Migrations fraîche/upgrade, données
historiques, contraintes, ACL, provisioning, contaminations, exécuteur R6,
non-régression C1, build API, OpenAPI/génération, scanner, tooling, licences et
audits npm complet/production demeurent **NON EXÉCUTÉS** dans cette reprise.

Les 14 fichiers techniques du gel pré-Docker restent byte-identiques. Cette
section est l'unique adaptation documentaire post-arrêt ; elle ne modifie ni
contrat, ni runtime, ni migration, ni provisionnement, ni configuration.

## Reprise avec Docker disponible du 2026-10-14

### Préflight et inventaire

Le gel d'entrée de reprise est le manifeste de 396 entrées et 47 368 octets,
SHA-256
`f9fecd59b9de5234ae4eed1c0c0b35f5d4190fc2b19e4789669591a3240a4d57`.
HEAD reste `d514b87cbef21dfae4585f4d143889aca2d8b229`, l'arbre HEAD reste
`2429871f3b440934cfbd02ceaaf0c74f3f8f3ac4`, l'index est vide et les
22 chemins autorisés sont les seuls chemins modifiés ou non suivis.

Depuis Codex, `docker version` et `docker info` ont répondu au code 0 avec le
client et le serveur 29.4.2, Docker Desktop 4.72.0 et un moteur Linux. Le socle
étranger observé avant création comptait 4 conteneurs, dont 2 actifs, 5
volumes, 5 réseaux et 4 images. Cet inventaire est une observation actuelle ;
il ne reconstruit pas les périodes historiques où le daemon était
inaccessible.

### Qualification PostgreSQL réelle

La campagne isolée finale
`20261014T223938100Z-c2a-postgresql-catalog-char-causal-replay-33e0a45e82b5`
s'est terminée au code 0, sans signal ni expiration du watchdog. Elle a utilisé
l'image verrouillée
`postgres:18.4-alpine3.24@sha256:9a8af...`, des noms, réseau, secrets et
conteneur propres à la tentative, ainsi qu'un stockage `tmpfs`.

Les preuves sont concluantes pour :

- migration fraîche et upgrade C1 avec préservation historique ;
- projection A/B identique, collision d'e-mail et refus des écritures
  partielles ;
- provisioning idempotent des quatre identités C2a ;
- ACL positives et négatives, grantor, namespace, contamination, memberships,
  ownership, attributs, paramètres, default ACL et surfaces `PUBLIC` ;
- contraintes différées, causalité, remplacements et transitions terminales ;
- exécuteur R6 réel avec `pg@8.22.0`, pool `max=1`, branches rollback et
  `COMMIT_UNKNOWN`, `ReadyForQuery` causal et discard unique ;
- non-régression C1 sur les frontières partagées ;
- 2 fichiers Vitest, 32 tests réussis, puis quiescence et nettoyage exacts.

Le warning `pg@8` est conservé comme réserve non bloquante : trois requêtes de
notification sont soumises au même client dans un `Promise.all`; pg 8.22 les
sérialise, mais annonce une incompatibilité future avec pg 9. Il ne concerne
pas l'exécuteur transactionnel de production et n'invalide pas la campagne sur
la version verrouillée.

Après nettoyage, le comparateur sémantique v2 confirme le retour exact au
socle étranger : 4 conteneurs, 5 volumes, 5 réseaux et 4 images. Aucun prune ou
nettoyage global n'a été exécuté. Docker Desktop reste ouvert conformément au
mandat.

### Gates finales

Les résultats archivés sont :

- format, lint, typecheck et build API : **PASS** ;
- tests API : **PASS** sur 19 fichiers, 128 réussis et 49 skips contractuels,
  avec `--testTimeout=20000` après diagnostic du coût de huit générations RSA
  2048 synchrones dans un test préexistant ; les trois tentatives au timeout
  par défaut restent **NON-PASS** ;
- génération de types OpenAPI en mode `--check` et génération Prisma :
  **PASS** ;
- scanner officiel : **PASS**, 396 fichiers, historique inclus, 52 éléments
  immuables et 6 scripts d'installation qualifiés ;
- validation des workflows CI : **PASS** ;
- licences : **PASS**, 933 paquets, aucun non déclaré ou non approuvé ;
- audits npm complet et production : **PASS**, zéro vulnérabilité ;
- première tentative `openapi:validate` : **NON-PASS historique**, liste Prisma
  protégée alors figée à 39 modèles au lieu des 48 modèles autorisés après C2a ;
- reprise `openapi:validate` : **PASS**, 60 chemins, 67 opérations, 141 schémas
  OpenAPI et 48 modèles Prisma, soit 39 historiques et neuf C2a ;
- premier candidat aligné : gates verts à 378/378 et 527/527, mais
  **NON-PASS de contre-revue** sur le gel `9e89692b…61bbb` parce qu'un modèle
  supplémentaire indenté échappait à l'extracteur ;
- suite OpenAPI/adversariale après correction causale : **PASS**, 379/379 ;
- première tentative `test:tooling` : **NON-PASS historique**, 451/522 réussis
  et 71 échecs en cascade issus du même prérequis OpenAPI ;
- reprise finale `test:tooling` : **PASS**, 528/528 ;
- génération officielle `--check` et scanner officiel : **PASS**.

La référence est explicite et ne se déduit pas du schéma contrôlé. Les neuf
modèles C2a exacts sont `AdminPasswordResetRequest`,
`AdminPasswordResetContext`, `AdminRecoveryCase`, `AdminInvitation`,
`AdminNotificationOutbox`, `AdminPaginationSnapshot`,
`AdminPaginationSnapshotItem`, `AdminBootstrapGuard` et
`AdminC2IdempotencyRecord`. Les régressions refusent suppression ou renommage
d'un modèle historique ou C2a, ajout — y compris indenté — et substitution à
cardinalité constante.

### Verdict local

Backend/Data, Security/PostgreSQL et Governance/QA sont concluants localement
sur les fondations, avec les réserves nommées, dont le warning `pg` distinct.
Les onze opérations HTTP, leurs workers métier et le bootstrap exécutable
restent **NON IMPLÉMENTÉS**. C2b et C3 sont **NON COMMENCÉS** ; fournisseurs
**NON QUALIFIÉS** ; politique OSS différée. Aucune indexation, publication ou
mutation GitHub n'a eu lieu.

## Avenant de qualification — C2a métier P0 technique — 2026-10-15

### Delta autorisé

Le writer C2a reçoit uniquement la lecture de
`AdminSession.accessTokenJti`, `stepUpPurpose` et `stepUpExpiresAt`.
`stepUpVerifiedAt`, `refreshTokenHash`, `tokenFamilyId`, `lastActivityAt`,
`createdAt`, `SELECT *` et les écritures step-up restent refusés. Les profils
`HTTP`, `NOTIFICATION`, `EXPIRATION` et `BOOTSTRAP` sélectionnent chacun une
identité et un pool C2a uniques ; aucun rôle n’est sélectionnable par l’appelant
et le mode désactivé reste sans pool C2a.

### Résultats réellement exécutés

- trois revues statiques pré-campagne : GO Architecture/Data, GO
  Security/PostgreSQL et GO Governance/QA ;
- format, lint et typecheck sur les octets techniques courants : PASS ;
- tests config/boundary hors PostgreSQL : 15 pass, 2 skips conditionnels ;
- campagne PostgreSQL 18.4 : code 0, stderr vide, migrations fresh/upgrade,
  préservation, provisioning idempotent, quatre identités, ACL, contamination,
  C1 et R6 ; suites transaction/boundary réelles 33/33 ;
- intégration API/C1 partagée : 12 pass et 46 scénarios réels indépendants
  skippés ; build API : PASS ;
- scanner officiel : PASS sur 396 fichiers avec historique ; tooling : 528/528
  hors sandbox ;
- conteneur, réseau et secrets P0 supprimés ; inventaire étranger préservé.

Les trois lectures notification sur le même client ont été remplacées par des
lectures séquentielles. Le replay réel ne produit aucun warning dans stderr. Ce
résultat ferme uniquement la réserve sur ce parcours ; `pg@8.22.0` n’est pas
qualifié de manière générale et sa version reste inchangée.

### Tentatives conservées

Restent NON-PASS historiques : erreurs initiales de lancement du collecteur,
replays bloqués par le sandbox, premier test à 14 pass remplacé par 15 pass,
premier `git diff --check` mal adressé et tooling sandbox à 525/528 sur trois
`EACCES`. Le premier dossier de campagne PostgreSQL a été observé
transitoirement sans métadonnée ni code final, puis s’est clos au code 0 avec
la même preuve complète PASS et sans résidu. La qualification « collecteur
interrompu, aucun verdict » est donc supplantée par les artefacts finaux ; le
replay r2, suivi explicitement jusqu’à sa clôture au code 0, reste la preuve de
clôture sélectionnée.

### Limites

L’annexe externe des huit arbitrages est une proposition non activée. Aucun des
onze endpoints, aucun worker métier et aucun bootstrap CLI n’est implémenté.
P1–P9, C2b, C3, fournisseurs de production, politique OSS, publication et
déploiement restent hors périmètre.

## Qualification cumulative C2a métier P1–P9 — 2026-10-16

Les limites de la section P0 précédente sont un instantané historique. Le
mandat P1–P9 adopte A1–A8 et autorise l'implémentation locale dans 56 chemins
exactement inventoriés; les modifications Foundations/P0 préexistantes hors de
cette allowlist ont été conservées sans édition.

### Surface exécutée

Le profil HTTP monte ensemble `requestAdminPasswordReset`,
`resetAdminPassword`, `createAdminRecoveryCase`, `listAdminRecoveryCases`,
`getAdminRecoveryCase`, `approveAdminRecoveryCase`,
`createAdminInvitation`, `acceptAdminInvitation`, `listAdminUsers`,
`changeAdminUserRole` et `changeAdminUserStatus`. Les profils notification,
expiration et bootstrap restent séparés. C1 démarre sans C2a et C2b n'est pas
monté.

Les garanties cumulatives couvrent cinq idempotences, deux listes à snapshots,
huit POST JSON mal formés avant contrôleur, preuve/rôle/step-up finaux sous
verrou, audit par stade de preuve, RBAC et dernier SUPER_ADMIN, outbox
PostgreSQL, notification fenced, expiration CAS, bootstrap stdin, deadlines R6,
discard unique et neutralité de `COMMIT_UNKNOWN`.

### Campagne réelle et corrections causales

La tentative sélectionnée avant la contre-revue finale
`20261016T104902587Z-p9-business-real-campaign-r12-10ead5b81a20` passe au code
0 : PostgreSQL 18.4 et Redis isolés, quatre migrations, quatre identités C2a,
7/7 scénarios, `operations=11`, `idempotences=5`, `snapshots=2`,
`malformed_json=8`, fournisseurs de test uniquement et `pg=8.22.0`. Le
nettoyage ciblé supprime les deux conteneurs, le réseau et les secrets de la
campagne; l'inventaire étranger observé est préservé. Elle reste la preuve
historique antérieure au finding de durabilité; la campagne r4 nommée plus bas
est la seule campagne finale sélectionnée après correction.

Les reprises r1 à r11 restent NON-PASS historiques. Elles ont établi puis fait
corriger, entre autres, trois causes dans l'allowlist :

- l'INSERT générique `AuditLog` nommait `bootstrapGuardId`, colonne refusée par
  l'ACL du writer ;
- l'échéance d'idempotence calculée côté processus ne pouvait garantir
  l'égalité exacte avec l'horloge murale PostgreSQL `clock_timestamp()` ;
- une erreur HTTP de domaine enveloppée par l'exécuteur était reclassée en 503,
  au lieu de conserver son statut sans toucher à `COMMIT_UNKNOWN`.

Chaque cause possède une régression ciblée et la campagne cumulative finale
les couvre. Les ajustements de fixtures et d'assertions conservent les
contraintes step-up, familles actives, garde bootstrap, sinks et concurrence;
aucune assertion contractuelle n'a été réduite.

### Gates sélectionnés

- format explicite des chemins autorisés, lint et typecheck API : PASS ;
- tests API : 28 fichiers, 186 pass et 56 skips conditionnels ; build : PASS ;
- OpenAPI : 60 chemins, 67 opérations, 141 schémas, 48 modèles Prisma ; suite
  adversariale : 379/379 ; génération officielle `--check` : PASS ;
- scanner historique : PASS sur 427 fichiers ; tooling : 530/530 ;
- licences : 933 paquets, zéro non déclaré et zéro non approuvé ;
- audits npm complet et production : zéro vulnérabilité ;
- scanner C2a ciblé : profils, ordre des gates, readiness, stdin, exécution sans
  shell, digests, isolation Docker et interdictions destructives couverts par
  des régressions adversariales.

La première invocation directe de l'audit complet, en échec `EINVAL`, reste
NON-PASS historique; la reprise PowerShell séparée est la preuve PASS. Les
autres NON-PASS de campagne ne sont ni effacés ni assimilés à une panne Docker.

### Limites de clôture

Les adaptateurs locaux annoncent `PROVIDER_ACCEPTED_FOR_TEST` et ne prouvent
aucun envoi réel. Notification, HIBP et keyring de production restent NON
QUALIFIÉS. Le parcours réel confirme `pg@8.22.0` sans warning sur la surface
exécutée, mais ne qualifie pas le driver globalement, la charge ou une panne
réseau distribuée. C2b/C3 ne sont pas commencés; politique OSS différée;
aucune indexation, publication ou mutation Git/GitHub n'est autorisée.

### Finding de contre-revue et reprise causale

La contre-revue Security/PostgreSQL/Transactional a bloqué le premier candidat
final : les refus post-preuve inséraient un `AuditLog` puis levaient une
exception dans le callback R6, ce qui annulait l'audit. Ce gel antérieur et ses
GO partiels restent historiques et ne valent pas conclusion finale.

La correction bornée introduit une rejection interne typée : le callback la
retourne, l'exécuteur confirme le COMMIT, puis le service restitue l'erreur HTTP
`ALREADY_DURABLE`. `COMMIT_UNKNOWN` conserve sa neutralité et n'autorise ni
replay ni second sink. Les nouvelles assertions PostgreSQL couvrent rôle,
step-up, conflit d'idempotence, recovery absent, recovery expiré et concurrence
du dernier SUPER_ADMIN. Cette dernière utilise `AdminSecurityEvent` si la
revalidation a invalidé l'acteur, ou `AuditLog` si la preuve reste valide et le
refus est métier.

La tentative réelle
`20261016T111656950Z-p9-durable-rejection-real-campaign-r4-817a6ce28f2e`
passe au code 0 avec 8/8 tests; elle nettoie ses deux conteneurs, son réseau et
ses secrets, puis confirme l'inventaire étranger préservé. Le lint, le
typecheck, les 28 fichiers API (186 pass, 56 skips) et le build repassent. Les
NON-PASS intermédiaires restent archivés : AuthorizationManager PowerShell,
accès Docker refusé par le sandbox, assertion de sink concurrent trop étroite
et cache Vitest `EPERM` dans le sandbox avant reprise hors sandbox.

## Reprise R1 C-05 — qualification cumulative — 2026-10-18

### Delta qualifié

La migration C2a locale a été amendée après preuve de son absence de `main`, de
`origin/main` et de toute base persistante à préserver. Elle ajoute une
génération idempotente, son unicité avec la clé métier, un index de lookup
actif et une contrainte de fenêtre exacte de 24 heures. Le déclencheur de
protection utilise un `search_path` fermé et ses droits publics sont révoqués.
Aucune migration C1 ou C2-P0 intégrée n'a changé.

Le runtime prend l'horloge murale PostgreSQL `clock_timestamp()` comme seule
autorité et la capture une fois dans une CTE matérialisée après le verrou. Il
traite la borne comme demi-ouverte, puis alloue
atomiquement `max(generation)+1` après expiration. Même payload, payload
différent, concurrence, conservation historique et impossibilité pour une
ancienne invocation d'écraser la nouvelle génération sont couverts. La
mutation, le sink et le résultat idempotent restent dans la même transaction;
rollback et `COMMIT_UNKNOWN` conservent leurs contrats.

### Preuves réelles sélectionnées

- Foundations PostgreSQL : 34/34, projections canoniques fresh/upgrade
  byte-identiques, contraintes, ACL, contamination, R6, rollback,
  `COMMIT_UNKNOWN` et C-05 PASS ;
- campagne métier : 12 contrôles réussis : 1 contrôle statique et 11 scénarios
  réels PostgreSQL/Redis/HTTP.
- non-régression C1 réelle : 47/47 ;
- API : format, lint, typecheck et build PASS; 28 fichiers, 211 pass et 61
  skips conditionnels ;
- OpenAPI 60 chemins/67 opérations/141 schémas et génération officielle
  `--check` PASS ; tooling 530/530, scanner historique et licences PASS ;
- audits npm complet/production réutilisés sur les mêmes dépendances et le
  même lockfile.

Les reprises antérieures restent NON-PASS avec leurs causes exactes : défauts
du wrapper PowerShell, propagation de sortie, isolation Redis, fixtures,
jointure d'outbox, cast d'identifiants, provisioning C1/C2a et variable Redis
C1. Un fichier parasite vide nommé `{}` créé par une sonde de signal mal
échappée a été identifié puis supprimé; aucun fichier autorisé n'a été remplacé.

Le premier gel terminal R1 C-05 `59ff4e1b…b22c00` reste NO-GO historique. Les
contre-revues ont démontré que l'oracle de borne comparait `expiresAt` à
lui-même et que la campagne métier n'injectait pas d'échec après l'INSERT
idempotent final. La reprise remplace l'oracle par trois cas réels construits
depuis une capture PostgreSQL unique — avant, à et après la borne — puis ajoute
un troisième scénario qui effectue l'INSERT idempotent avant de lever une erreur
contrôlée et vérifie l'absence durable de mutation, audit, idempotence et second
`AdminSecurityEvent`.

### Limites terminales à réconcilier

Les profils notification et expiration s'arrêtent proprement par leur canal de
preuve. Sur Windows, la livraison de signal OS observée termine le processus
sans handler gracieux observable; cette plateforme ne fournit donc pas ici la
preuve POSIX attendue. Aucun succès fictif n'est déclaré sur ce point.

Le parcours réel utilise `pg@8.22.0`, sans lever sa réserve globale. Les
adaptateurs restent de test; notification, HIBP et keyring de production sont
NON QUALIFIÉS. C2b/C3 ne sont pas commencés, la politique OSS reste différée,
et aucune indexation, publication ou livraison n'est autorisée.

## Raccordement CI et candidat de publication — 2026-10-18

Le mandat de publication distinct autorise l'ajout des deux wrappers existants
au workflow Infrastructure. Le job génère d'abord Prisma après `npm ci`, garde
le gate C1, exécute le wrapper Foundations C2a puis le wrapper métier C2a, et
conserve ensuite Compose, lifecycle et santé API. Les steps ne sont ni
conditionnels ni masqués ; leurs codes d'échec restent ceux du job. Les
wrappers continuent d'allouer des noms, ports et secrets éphémères, puis de
nettoyer uniquement leurs ressources identifiées.

La campagne historique P1–P9 demeure 8 contrôles réussis : 1 contrôle statique
et 7 scénarios réels PostgreSQL/Redis/HTTP. La campagne finale sélectionnée
demeure 12 contrôles réussis : 1 contrôle statique et 11 scénarios réels
PostgreSQL/Redis/HTTP. Les 61 skips conditionnels restent répartis en 11 C2a,
46 C1 et 4 Foundations-P0 ; les campagnes réelles séparées ne transforment pas
ces skips en PASS.

À cet instant prépublication, le comportement Linux et l'exécution CI des deux
nouveaux steps sont **NON EXÉCUTÉS / EN ATTENTE**. L'arrêt gracieux par signal
OS Windows/POSIX reste **NON DEMONSTRATED**. Les fournisseurs de production
restent **NON QUALIFIÉS** ; le succès local de `pg@8.22.0` reste limité aux
chemins exercés. C2b/C3 ne sont pas commencés et la politique OSS reste
différée.

## R2 — remédiation locale du validateur historique C1 — 2026-10-18

Le run Infrastructure `39135914973` et son diagnostic restent historiques :
le parcours upgrade appliquait les trois migrations C1, mais `migrate diff`
utilisait le schéma courant C2a à 48 modèles ; le parcours vide pouvait en plus
déployer la quatrième migration. La projection C1 attendue à 39 modèles ne
pouvait donc pas être cohérente. Aucun step C2a skipped dans ce run n'est
transformé en PASS.

La correction ajoute une référence de validation autonome, pas un schéma
applicatif : copie byte-exacte du schéma à `d514b87…`, 36 144 octets, blob
`e02e0cd…`, SHA-256 `812fe0b4…`. Le validateur vérifie ces trois identités, les
39 modèles exacts, la configuration, les trois migrations, le lock et le
toolchain Prisma 7.9.1 avant emploi. Il matérialise uniquement ces six fichiers
dans un workspace unique sous `tmp`, refuse traversée, reparse point et entrée
supplémentaire, désactive C2a dans le provisionneur et nettoie fichier par
fichier. L'identité filesystem du root, des répertoires et fichiers est
mémorisée puis revérifiée ; une substitution byte-identique est refusée sans
suppression. La base `tmp` créée par l'invocation n'est retirée qu'identique et
vide, tandis qu'une base préexistante est préservée. Il n'exécute ni
`git show`, fetch, checkout profond, ni génération Prisma historique.

La campagne C1 réelle passe : bases A/B à 39 modèles, 40 tables et trois
migrations, projection A/B identique, contraintes, ACL et neuf refus de
provisioning/membership ; le workspace est retiré et schéma, migrations,
configuration et client généré courants restent inchangés. La suite HTTP C1
sur le schéma courant passe 47/47. Les wrappers suivants passent séparément :
Foundations C2a 34/34 ; métier C2a, 12 contrôles réussis — 1 contrôle statique
et 11 scénarios réels PostgreSQL/Redis/HTTP — avec C1 47/47. Le tooling passe
536/536 et `tmp` est absent après campagne. Le premier lancement direct de `npm.cmd` reste NON-PASS
d'orchestration (`spawn EINVAL`, aucun test exécuté) ; la reprise causale via
`cmd.exe`, rejouée après le durcissement, est la preuve sélectionnée.

Ce résultat est local. Il ne requalifie ni le run CI échoué, ni Linux, ni les
fournisseurs. L'arrêt gracieux par signal OS Windows/POSIX reste NON
DEMONSTRATED ; `pg@8.22.0` reste borné aux chemins exercés, C2b/C3 ne sont pas
commencés et la politique OSS reste différée.

## R3 — identité d'image Docker et cleanup conditionnel

### Diagnostic sélectionné

Le log brut Infrastructure `39168610286` échoue dans le wrapper Foundations sur
la comparaison entre inventaire et inspection exacte, puis `infra:down` échoue
secondairement parce que `infra:prepare` n'avait pas été atteint. Les valeurs
comparées n'ont pas été journalisées : la reproduction de l'hypothèse « une
seule ligne tag/digest/ID » n'est pas une preuve de la cause historique, qui
reste **NON CONCLUSIVE**.

R3 journalise uniquement référence publique, digest attendu, codes,
classification, ID, RepoTags, RepoDigests et lignes d'inventaire liées. Il
sépare digest de manifeste et ID local, accepte les représentations multiples,
et ne reconnaît l'absence qu'après quatre preuves cohérentes. Le nettoyage exige
une acquisition photographiée, refuse les consommateurs actifs ou arrêtés et
les références partagées, puis retire uniquement `tag@digest`. Le workflow
utilise une instance unique et un état atomique. Le finding de contre-revue
`S-R3-01` est fermé : le cas partiel ne nettoie que le sous-ensemble attesté,
les états complets exigent exactement cinq fichiers et deux répertoires, et
l'identité no-follow (`type/dev/ino/mode/birthtimeNs`) de ces objets comme du
manifeste d'ownership est revérifiée. Une substitution byte-identique ou un
manifeste réduit est préservé et fait échouer le cleanup.

### Résultats locaux

- parsing PowerShell et validation du workflow : PASS ;
- régressions R3 causalement concernées : 5/5 ;
- tooling final hors sandbox : 541/541 ;
- Foundations réel : 34/34, ACL/transactions/C-05 et cleanup PASS ;
- métier réel : 1 contrôle statique + 11 scénarios PostgreSQL/Redis/HTTP ;
- non-régression C1 : 47/47 ;
- inventaire Docker étranger : restauré après chaque wrapper.

Les tentatives intermédiaires 36/38 puis 34/38 restent NON-PASS. Elles ont mené
au finding causal d'ordre : les nouvelles fixtures PowerShell lourdes
précédaient des tests historiques à deadline très courte. Après déplacement en
fin de fichier, la même suite passe 39/39. Le premier lancement réel du wrapper
reste NON-PASS sans ressource créée : résolution Windows multiple de
`docker.exe`, corrigée en sélectionnant l'exécutable déterministe.
La tentative tooling sandboxée 538/541 reste également NON-PASS : deux sockets
locales et une fixture Git temporaire ont reçu `EACCES`. La reprise causale hors
sandbox passe 541/541. Après fermeture de `S-R3-01`, le run direct du fichier
sur les octets finaux reste NON-PASS 37/39 à cause de deux tests historiques de
deadline/socket ; ses cinq contrôles R3 passent. La première reprise tooling,
initialement observée avant l'apparition de ses métadonnées finales, termine en
réalité au code 0 avec 541/541 et stderr vide. Elle chevauche pendant environ
34 secondes la reprise causale, elle aussi conclue 541/541 sans modification
technique supplémentaire. Cette dernière inclut les 39 contrôles du fichier
ciblé et reste la preuve finale sélectionnée ; la première n'est plus classée
NON CONCLUSIVE.

Ce PASS est local et ne vaut pas succès Linux/CI. La preuve de signal gracieux
Windows/POSIX reste NON DEMONSTRATED ; fournisseurs NON QUALIFIÉS, C2b/C3 non
commencés et politique OSS différée.

## C2a R4 — arrêt des runners et preuve POSIX locale — 2026-10-20

### Historique et reproduction sélectionnée

Le résultat R3 métier 10/12 reste NON-PASS : C1 47/47 et Foundations 34/34
étaient réussis, mais notification et expiration avaient dépassé 45 secondes
après SIGTERM avant le SIGKILL de sécurité. R4 ne reclassifie pas ce run.

La reproduction pré-correction emploie l'image Linux
`node:22.18.0-bookworm-slim@sha256:752ea8a2f758c34002a0461bd9f1cee4f9a3c36d48494586f60ffce1fc708e0e`,
des conteneurs PostgreSQL/Redis et un réseau dédiés. Les sources sont copiées
sans `node_modules` Windows, puis installées depuis le lockfile et compilées
dans le conteneur. Pour chaque exécutable, le parent conserve stdin ouvert et
envoie un vrai SIGTERM. Le runner ferme ses ressources et écrit son outcome
sain, mais ne sort pas dans les cinq secondes suivantes. La fermeture
diagnostique de stdin, postérieure au constat, entraîne une sortie immédiate à
code 0. Cette comparaison démontre le rôle causal du listener stdin du mode
preuve, sans attribuer l'origine des incidents Docker ou R3.

### Correction

Les deux points d'entrée possèdent désormais explicitement leur listener de
preuve. Ils le retirent sur message ou terminaison, puis pausent le flux
uniquement lorsqu'il n'était pas déjà actif et qu'aucun listener tiers ne
subsiste. Ils ne ferment, ne détruisent ni ne déréférencent stdin. Les handlers
SIGINT/SIGTERM emploient une écoute persistante pendant le cleanup afin que des
signaux répétés appellent un stop idempotent, puis retirent seulement leurs
propres listeners. Les modules Nest et la frontière PostgreSQL n'ont pas été
modifiés, car la preuve pré-correction montrait leur fermeture effective.

La première contre-revue a classé le gel candidat BLOCK : les handlers étaient
alors retirés au début du `finally`, avant `awaitQuiescence` et
`application.close()`. Le correctif terminal les maintient jusqu'après ces
étapes et garantit leur retrait dans un `finally` imbriqué.

### Preuves après correction

- Linux : notification et expiration reçoivent chacun un vrai SIGTERM avec
  stdin parent ouvert, sortent à code 0 et signal terminal null, sans SIGKILL ;
  outcomes `failed:false` et `forceExit:false`.
- Linux, reprise du finding de revue : chacun reçoit un premier vrai SIGTERM,
  le harnais attend le marqueur de cleanup actif, puis envoie un second vrai
  SIGTERM ; fermeture unique, code 0, signal null, sans SIGKILL.
- Tests ciblés : 34/34, incluant ressource stdin possédée, listener tiers,
  opération active, signaux répétés, quiescence et échec de close.
- Campagne réelle : 12 contrôles réussis — 1 contrôle statique et 11 scénarios
  réels PostgreSQL/Redis/HTTP — avec processus compilés, BullMQ, bootstrap,
  notification, expiration et cleanup ciblé.
- Non-régression C1 : 47/47.
- Non-régressions transactionnelles ciblées R6/frontières : 30 pass et 4
  skips conditionnels ; les chemins PostgreSQL réels applicables sont couverts
  séparément par la campagne métier réussie.
- Gates : format, lint, typecheck, build API, scanner et tooling 541/541 PASS.

La campagne combinée finale a réussi ses 12/12 contrôles métier, puis son
sous-processus C1 a atteint le watchdog et retourné `code=null` : cette
tentative reste NON-PASS. La validation C1 dédiée sur les mêmes octets et des
ressources neuves passe ensuite 47/47, avec cleanup ciblé complet. Elle fournit
la preuve C1 sélectionnée sans reclasser la tentative combinée.

Les essais `spawn EINVAL`, EPERM sandbox, l'interpréteur PowerShell 5.1
incompatible et le premier post-fix stdin incomplet restent NON-PASS ou NON
EXÉCUTÉS selon leur nature. Le warning de détection OpenSSL Prisma dans l'image
Node slim est conservé ; migrations, génération, build et processus réels ont
néanmoins terminé à code 0. La terminaison OS Windows reste non gracieuse et
n'est pas transformée en preuve POSIX. CI R4, Linux de production et
fournisseurs restent NON QUALIFIÉS ; `pg@8.22.0` reste borné aux chemins
exercés, C2b/C3 non commencés et politique OSS différée.

## Requalification C2a R5 — Vite 8.1.6 — 2026-10-21

R5 remédie l'advisory Vite par trois pins directs exacts `8.1.6` : racine,
API et Admin. Le candidat avec override `vitest@4.1.11` résolvait déjà le bon
graphe mais restait BLOCK, car le scanner officiel interdit ce sélecteur.
L'avenant terminal autorise son retrait seul ; tous les autres overrides sont
préservés et `package-lock.json` reste byte-identique après régénération npm.

La reprise qualifiée démontre :

- `npm ci --ignore-scripts --no-audit` code 0 dans une copie vierge ;
- `npm ls vite --all` et `npm ls --all` code 0 ;
- un seul Vite verrouillé et installé en `8.1.6`, partagé par racine, API,
  Admin, Vitest et mocker ;
- aucune copie `8.0.0–8.1.5`, peer invalide ou dérive de production ;
- snapshots avant/après byte-identiques pour versions, emplacements,
  intégrités et relations de dépendance ;
- scanner officiel et audits npm complet/production frais code 0.

Le graphe installé étant identique au candidat déjà testé, les preuves API
217 PASS/61 SKIP, Admin 13/13, builds, tooling 541/541 et R4 hôte/Linux 34/34
restent applicables sans nouveau Docker. Les quatre candidats antérieurs,
l'erreur interne npm `Exit handler never called`, les erreurs sandbox et les
autres NON-PASS restent conservés sans reclassification.

Cette clôture est locale, non indexée et non publiée. PR #52 reste OPEN/Draft ;
fournisseurs NON QUALIFIÉS, C2b/C3 non commencés et politique OSS différée.

## C2a R6 — correction INFRA-C1-LOCK-01 — 2026-10-21

Le run Infrastructure `39622417014` reste un BLOCK historique. Après
`npm ci` et génération Prisma, le validateur C1 comparait le blob OID du
`package-lock.json` complet à `405fea63…`. Le lock R5 `cfcf0522…`, dont le
delta est limité aux trois déclarations Vite et à l'unique entrée Vite
`8.1.6`, était donc refusé avant toute campagne C1/C2a. Une comparaison directe
des deux locks confirme pourtant que la projection protégée Prisma est
identique.

R6 sépare désormais deux garanties :

- la reproductibilité historique porte sur le schéma autonome C1, les six
  artefacts à empreintes fixes, les trois migrations, et une projection
  canonique du sous-graphe npm réellement atteignable depuis `prisma@7.9.1` ;
- la non-mutation pendant l'exécution porte sur les octets et l'identité
  filesystem du lockfile courant et du manifeste Prisma installé, capturés
  avant la campagne et revérifiés après son cleanup.

La projection qualifiée comprend 131 paquets du lock npm v3 et porte le
SHA-256 `4ee0f8df901d14c7d6eec658575eba6ddaa45860f21d0aa15cf4b0c9a14d5bcb`.
Elle est identique sur les locks R4 et R5. Vite n'est accepté que parce qu'il
n'appartient pas à cette fermeture de dépendances ; une dérive d'une entrée
Prisma protégée reste refusée. Toute mutation du lockfile pendant la campagne,
y compris Vite, fait échouer le postflight.

Preuves locales sélectionnées :

- schéma historique absent/altéré : refus ;
- migration C1 historique altérée : refus ;
- changement Vite hors projection : accepté ; dérive Prisma : refus ;
- mutation du lockfile entre préflight et postflight : refus ;
- tests ciblés : 42/42 ; tooling complet : 544/544 ;
- wrapper C1 réel : bases A/B à 39 modèles, 40 tables et trois migrations,
  projection identique, contraintes, ACL et neuf refus de
  provisioning/membership ; HTTP réel 47/47 ;
- scanner officiel : 428 fichiers, historique activé, zéro suppression suivie
  omise ;
- inventaires Docker conteneurs, volumes, réseaux et images byte-identiques
  avant/après ; ressources éphémères et secrets ciblés supprimés.

Les tentatives sandboxées `EPERM/EACCES`, l'installation npm refusée par le
sandbox et l'invocation initiale avec un chemin `pwsh` absent restent
NON-PASS ou NON EXÉCUTÉES selon leur stade ; leurs reprises causales sont
archivées séparément. R6 ne modifie ni dépendance, lockfile, migration, schéma,
runtime métier, scanner ou workflow. Le GO décrit ici est local et
prépublication ; aucune CI R6 n'est affirmée. Fournisseurs NON QUALIFIÉS,
C2b/C3 non commencés et politique OSS différée.

## C2a R7 — verrou Foundations — 2026-10-21

Le run Infrastructure R6 `39672953748` est conservé comme BLOCK historique.
Il démontre C1 réel 47/47, puis Foundations refuse l'ancien SHA-256 global du
lock R4 `a1b9744d…` face au lock R5 qualifié `5470b8d8…`. Les étapes
Foundations restantes, métier, lifecycle et API health de ce run ne sont pas
présentées comme exécutées.

R7 remplace cette égalité globale par les références effectivement utilisées :

- projection Prisma R6 : version `7.9.1`, 131 paquets, SHA-256
  `4ee0f8df901d14c7d6eec658575eba6ddaa45860f21d0aa15cf4b0c9a14d5bcb` ;
- fermeture `pg@8.22.0` : 14 paquets, SHA-256
  `27d546111f7b0947315339dd6bc6f1d852398ed00d8ab0b2b5fa15166f1b7b26` ;
- entrée Vitest `4.1.11` protégée par version, intégrité et projection canonique ;
- trois migrations historiques conservées à leurs empreintes exactes.

Le lockfile complet et les manifestes installés Prisma, pg et Vitest sont
capturés avant la campagne par octets et identité no-follow, puis comparés
après le cleanup. Ce postflight s'exécute également après une erreur de
validation et conserve conjointement l'erreur principale et une éventuelle
mutation des entrées protégées.

Preuves locales sélectionnées sur le même candidat :

- Vite 8.1.6 et une mutation Vite indépendante hors fermetures : acceptés ;
- dérive Prisma, dérive pg et migration historique altérée : refusées ;
- mutation du lockfile pendant une campagne déjà en échec : refusée ;
- régressions ciblées post-format : 47/47 ; tooling complet : 549/549 ;
- C1 réel : projections A/B, ACL et HTTP 47/47 ;
- Foundations réel : fresh/upgrade, projection A/B, ACL, provisioning,
  transactions et 34/34 ;
- métier réel : 1 contrôle statique + 11 scénarios PostgreSQL/Redis/HTTP et
  non-régression C1 47/47 ;
- inventaires Docker étrangers conteneurs, volumes, réseaux et images
  byte-identiques avant/après.

Le gate supply-chain terminal reste rouge : l'audit production frais passe à
zéro vulnérabilité, mais l'audit complet frais termine au code 1 avec trois
vulnérabilités modérées dans le graphe Vitest, associées à
`GHSA-qxg6-89mg-rqv8` et `GHSA-xp26-3454-mjgp`. R7 n'autorise aucun changement
de dépendance, lockfile, `audit fix` ou `--force`. Le candidat est donc conservé
localement sans indexation, commit, push ou nouvelle CI. Fournisseurs NON
QUALIFIÉS, C2b/C3 non commencés et politique OSS différée.

## C2a R8 — remédiation Vitest 4.1.12 et finalisation R7+R8 — 2026-10-21

### Graphe et bridge npm qualifié

Les quatre workspaces consommateurs déclarent désormais `vitest: "4.1.12"`
exact, et API déclare `@vitest/coverage-v8: "4.1.12"`. Le lock sélectionné
compte 518 223 octets et porte le SHA-256
`b762f32dce62c9b9dbc5d2864571520894f7860147278e9810a58d8283900fe8`.
Il ne modifie que les quatre métadonnées workspace et 14 entrées de
développement liées à la famille Vitest et à ses résolutions nécessaires ;
toutes les dépendances de production restent identiques.

npm `10.9.3` échoue pendant la résolution initiale dans Arborist sur
`edgesOut`. Le diagnostic relie ce chemin au peer optionnel
`@vitest/browser-webdriverio ^4.1.11` de Vitest 4.1.12 : la version 4.1.12 de
ce peer n'est pas publiée et la version 4.1.11 exige Vitest 4.1.11. Le bridge
autorisé utilise npm `11.6.0` seulement dans une fixture hors dépôt, ajoute
temporairement les trois entrées `@emnapi` historiques nécessaires, retire
ces déclarations avec `npm pkg delete`, vérifie le manifeste racine
byte-identique, puis laisse npm `10.9.3` finaliser le lock. Aucune intégrité
n'est éditée manuellement ; Node `22.18.0`, npm `10.9.3` et
`packageManager` restent inchangés.

Les preuves sélectionnées sont :

- `npm ci --no-audit --no-fund` isolé et dans le worktree : code 0 ;
- `npm ls --all` et arbre Vitest/Vite : code 0, aucun `invalid` ou
  `ELSPROBLEMS` ;
- Vitest, mocker et coverage `4.1.12`, Vite `8.1.6`, aucune copie Vitest
  `4.1.11` installée ;
- entrées `@emnapi` historiques conservées et graphe production inchangé ;
- projections Prisma `7.9.1`/131 paquets et pg `8.22.0`/14 paquets
  inchangées.

### Gates sélectionnés

- scanner officiel : 428 fichiers, historique actif, zéro suppression suivie
  omise ; scanner adversarial 109/109 avec refus explicite de 4.1.11 ;
- protections R7 : 47/47 ; tooling complet, repris seul après un NON-PASS de
  contention à 547/549, passe 549/549 sans changement de borne ;
- API 217 pass/61 skips conditionnels, Admin 13/13, Web 10/10, UI 11/11 ;
- lint et typecheck des quatre workspaces, builds API/UI et reprises causales
  des builds Next Admin/Web : PASS ;
- audits npm complet et production : code 0, zéro vulnérabilité, stderr vide ;
- signatures : 931 paquets vérifiés et 192 attestations ; licences :
  933 paquets, zéro non déclarée, zéro non approuvée ;
- R4 hôte 34/34 et Linux 34/34 ; notification et expiration reçoivent chacune
  deux vrais SIGTERM pendant le cleanup, puis sortent code 0/signal null sans
  SIGKILL ;
- C1 réel : projections A/B, ACL et HTTP 47/47 ;
- Foundations réel : fresh/upgrade, ACL, provisioning, transactions et 34/34 ;
- métier réel : 1 contrôle statique + 11 scénarios PostgreSQL/Redis/HTTP, puis
  non-régression C1 47/47.

### Historique et limites conservés

Les essais npm `edgesOut`, le lock npm 11 qui écartait des entrées historiques,
les erreurs de lancement, les échecs sandbox, les builds Next sans droit de
jonction et le tooling concurrent 547/549 restent NON-PASS ou NON EXÉCUTÉS
selon leur stade. Le test Admin passe avec un warning de source map AdminLTE
absente. La campagne Linux conserve le warning de détection OpenSSL Prisma ;
installation, génération, build, tests et signaux terminent néanmoins au code 0. La terminaison OS Windows observée par le wrapper métier reste non
gracieuse ; seule la preuve POSIX Linux locale est établie.

Toutes les ressources C1/Foundations/métier et le conteneur Linux sont
supprimés. L'image Node acquise par R8, absente de l'inventaire d'entrée, est
également retirée sans force après vérification qu'aucun conteneur ne la
référence. Les services Docker étrangers restent préservés.

Le candidat R7+R8 reste local jusqu'au gel reproductible et aux trois revues
terminales. Fournisseurs NON QUALIFIÉS, Linux de production NON QUALIFIÉ,
C2b/C3 non commencés et politique OSS différée.

## C2a R9 — identité d'instance lifecycle — 2026-10-22

### Correctif et régressions

Le lifecycle n'utilise plus la confirmation codée en dur `kora-plus-local` :
il importe `PROJECT_NAME` depuis `lib.mjs` et transmet cette identité résolue à
`resetProject`. Les contrôles existants de confirmation, labels, volumes et
propriété ne sont pas affaiblis. Deux fixtures comportementales démontrent que
le reset reçoit le projet éphémère résolu et qu'une confirmation appartenant à
une autre instance est refusée avant toute commande Docker, sans activer la
compatibilité legacy.

### Incident conservé et restauration séparée

La première campagne réelle R9 n'était pas isolée. Le lanceur hors dépôt fondé
sur un assemblage `set/cmd` fragile n'a transmis aucune variable `KORA_*` au
processus enfant ; celui-ci a résolu `local`, recréé les conteneurs PostgreSQL
et Redis étrangers, puis échoué à l'authentification de la migration. Le reset,
la création de marqueurs et le provisioning n'ont pas été atteints. Cet
incident reste archivé comme BLOCK historique.

Une intervention distincte a sauvegardé les observables, puis restauré chaque
service depuis sa source Compose qualifiée, sans `down` global, prune,
suppression de volume, migration ou provisioning. PostgreSQL et Redis sont
revenus sains et conformes ; STREAM et les autres ressources ont été
préservés. Les sauvegardes capturent l'état observable au moment de l'incident,
mais l'intégrité byte-à-byte des volumes et l'état logique préincident exhaustif
restent **NON DEMONSTRATED**.

### Reprise isolée qualifiée

Le lanceur corrigé reste hors dépôt et transmet les variables par un objet
`env` explicite. Le même processus enfant atteste, avant import du script
cible, l'instance dédiée, le `PROJECT_NAME`, le répertoire local, les ports et
l'empreinte de la configuration. Les cas variable absente, valeur `local`,
divergence et substitution sont refusés avant Docker ; la fixture préventive
passe 5/5.

Sur l'instance unique `r9-20261022t1120z-a91c`, absente au préflight :

- le lifecycle complet démontre persistance après restart, reset ciblé,
  disparition des marqueurs, idempotence start/stop et état final sain ;
- API health démontre `live=200` et `ready=200`, puis les transitions attendues
  lors des indisponibilités Redis et PostgreSQL, leur récupération et le reset
  ciblé ;
- après lifecycle, API health et cleanup, les inventaires étrangers et les
  inspections protégées KORA/STREAM restent sémantiquement identiques ;
- seuls deux conteneurs, deux volumes, un réseau et le répertoire local ignoré
  de la campagne sont retirés.

### Gates, historique et limites

- régressions R9 : PASS ; tooling officiel : 551/551 ;
- scanner officiel : PASS ;
- audits npm complet et production : code 0, zéro vulnérabilité, stderr vide ;
- les preuves C1 47/47, Foundations 34/34, métier 1 contrôle statique +
  11 scénarios réels, R4 Linux et supply-chain R8 restent applicables, leurs
  surfaces et dépendances étant inchangées.

Les micro-fixtures ayant atteint leurs très courtes fenêtres de scheduling et
les refus sandbox `EACCES`/`EPERM` restent NON-PASS. Le `spawn EINVAL` de
l'appel direct à `npm.cmd` n'a démarré aucun test et reste NON EXÉCUTÉ. La
première exécution via `cmd.exe`, silencieuse pendant l'observation mais
concluante 551/551 en 115 secondes, a été rejointe par erreur par la reprise
également concluante 551/551 pendant ses 6,6 dernières secondes. Cette double
exécution accidentelle est conservée comme incident d'orchestration et n'est
pas présentée comme une reprise nécessaire. Au moment de cet instantané local,
aucune réussite CI R9 n'était encore acquise ; l'état publié postérieur est
consigné ci-dessous.

## Publication R9 et état CI courant — 2026-10-22

Le head source `fd0f084fc6316c379454ef701307e79471ed92e2`, arbre
`761251da5c6f624bdcaf40186ccb6a542fa35217`, est publié dans la Draft PR #52
sur la base `d514b87cbef21dfae4585f4d143889aca2d8b229`. La PR reste
`OPEN/Draft`, non fusionnée et non déployée.

Les quatre runs `pull_request`, tentative 1, sont verts sur le head source
exact et le merge synthétique `8cc7c81b40c8d7e197a6920b08a734d9dc23ea5e` :

- Infrastructure `39818813532` ;
- Launcher Windows `39818813686` ;
- Security `39818813647` ;
- Quality Linux `39818813472`.

Infrastructure exécute C1 47/47, Foundations 34/34 et le métier sous la forme
exacte **1 contrôle statique + 11 scénarios réels**, puis lifecycle, API
health, arrêt gracieux POSIX des runners et cleanup. La suite API générale
conserve 217 PASS et 61 SKIP — 46 C1, 11 C2a et 4 Foundations-P0. Les
campagnes réelles séparées couvrent les scénarios conditionnels concernés ;
les 61 SKIP ne sont pas reclassés PASS.

R8 a qualifié le graphe courant Vite `8.1.6` / Vitest `4.1.12`. Les mentions
R5 de Vitest `4.1.11`, les BLOCK R6–R8 et l'échec CI R8 au lifecycle restent
des instantanés historiques. L'incident local R9 et sa restauration ciblée
restent également conservés : l'intégrité byte-à-byte des volumes et l'état
logique exhaustif préincident demeurent **NON DEMONSTRATED**.

Le signal gracieux Windows reste **NON DEMONSTRATED**. Fournisseurs de
production NON QUALIFIÉS, Linux de production NON QUALIFIÉ, C2b/C3 non
commencés et politique OSS différée.

## Qualification locale R10+R11 — 2026-10-22

R10 ferme F-01 et F-02. La migration passe de 90 034 à 90 033 octets par
retrait du seul LF surnuméraire final ; SHA-256 final
`eba1a1e4729b57041d681ea7beafa8608d0e7731be94afa014f0e6171f415c8a`.
Foundations passe 34/34 sur une instance éphémère et exerce fresh/upgrade,
projections, préservation historique, provisioning, ACL, transactions et C-05.
Aucun checksum d'une installation persistante n'a été modifié. Les documents
ci-dessus distinguent désormais l'état R9 publié des instantanés locaux.

Les audits R10 ont ensuite ouvert `R10-SC-01` sur Next.js `16.3.8`. R11 le
ferme localement avec Next.js `16.4.1` dans Admin/Web,
`eslint-config-next`/plugin `16.4.1` dans Admin/Web/UI, Next/env/SWC cohérents
et sharp `0.35.5`. Le lock final conserve Vite `8.1.6`, Vitest/mocker `4.1.12` et les
projections Prisma/pg. Le bridge npm reste une fixture hors dépôt ; npm 10.9.3
accepte ensuite le lock par installation et arbre complets.

Résultats sélectionnés sur les octets techniques finaux :

- audits complet/production : code 0, zéro vulnérabilité ;
- signatures : 929 signatures de registre et 190 attestations ;
- licences : 931 paquets installés, zéro licence absente ou non approuvée ;
- scanner officiel et régressions 112/112 : PASS ;
- test de compatibilité Next 7/7 et tooling complet 554/554 : PASS ;
- Admin 13/13, Web 10/10, UI 11/11, lint/typecheck/builds : PASS ;
- smokes production loopback et optimisation PNG→WebP : PASS.

Le tooling 552/554 antérieur, les erreurs sandbox, les candidats npm rejetés et
le premier smoke à attente 400 trop stricte restent NON-PASS ou NON CONCLUANTS
selon leur nature. Ils ne sont pas effacés par les reprises causales.

Le candidat R10+R11 reste local au présent instantané. La PR #52 est toujours
`OPEN/Draft` au head R9 `fd0f084fc6316c379454ef701307e79471ed92e2` et
aucune CI R11 n'est encore acquise. L'incident R9, l'intégrité byte-à-byte des
volumes et l'état logique complet préincident NON DEMONSTRATED, le signal
Windows NON DEMONSTRATED, les 61 SKIP, Linux et fournisseurs de production non
qualifiés, C2b/C3 non commencés et la politique OSS différée sont conservés.

## Addendum post-intégration et impact C2b R1 — 2026-10-24

C2a a ensuite été intégré dans main au merge
`029e30bbc795f3d9c153782bc04e45e9f5a03f8a`, arbre
`a32f8332e80c18c565521418fe197619f8fb56d9`. Les paragraphes R9–R11
précédents restent des instantanés historiques et ne décrivent plus le statut
GitHub courant.

La traversée locale du candidat C2b confirme C1 47/47 et le métier C2a avec un
contrôle statique plus onze scénarios réels. Le premier wrapper Foundations,
encore figé sur quatre migrations, reste **NON-PASS historique**. R1 sépare la
chaîne historique C2a de la chaîne courante C2b et qualifie les cinq migrations
exactes, fresh/upgrade, projections, données, ACL et transactions. Cette preuve
n'altère ni ne surinterprète le Foundations 34/34 publié pour C2a.

Les 61 SKIP historiques C2a restent des SKIP. Le signal Windows, les limites
préincident R9, les installations persistantes externes, les fournisseurs et
Linux de production restent dans leur portée précédente.

R1 ne modifie aucune surface métier C2a : sa campagne reste 1 contrôle statique
et 11 scénarios réels. La preuve C2b sélectionnée qualifie séparément 11
scénarios PostgreSQL/Redis/HTTP, dont la frontière snapshot à 10 000 entrées,
l'expiration positive et la réutilisation idempotente expirée. Les audits npm
complet/production trouvent zéro vulnérabilité sur le graphe propre final. Les
premiers audits rouges, le verrou à quatre migrations et les preuves C2b
incomplètes restent archivés comme NON-PASS historiques.

Le verdict **GO LOCAL C2b R1** ne republie ni ne requalifie C2a. Les 72 SKIP de
la suite API finale C2b restent distincts des campagnes réelles ; aucun SKIP
n'est converti en PASS. Publication C2b, fournisseurs et Linux de production
restent hors qualification.

Le raccordement CI candidat ne change aucun runtime C2a ni ses compteurs. Il
réutilise les commandes officielles C1, Foundations et métier C2a avant les
deux campagnes C2b, puis lifecycle et API health. Cette topologie ne transforme
ni les 61 SKIP historiques C2a ni les 72 SKIP de la suite API C2b en PASS. À
ce stade documentaire, le harnais ciblé passe 53/53 et les deux campagnes C2b
propres passent ; publication et workflows C2b restent à venir.
