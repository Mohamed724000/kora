# S1.2-03C2a — rapport de qualification des fondations runtime admin

## Statut

**GO LOCAL — fondations C2a et métier P0–P9 qualifiés, non publiés.**

Docker Desktop/Linux Engine est disponible depuis Codex et reste démarré.
La campagne PostgreSQL isolée est concluante. L'avenant ciblé aligne désormais
le validateur OpenAPI sur exactement 48 modèles Prisma : 39 historiques et neuf
C2a. Les précédents NO-GO Docker et le premier NON-PASS OpenAPI/tooling restent
historiques et ne sont pas requalifiés.

Le lot local est fondé sur le commit
`d514b87cbef21dfae4585f4d143889aca2d8b229`, branche
`feat/s1-2-03c2a-admin-security-runtime`. Aucun fichier n'est indexé, commité
ou publié. Aucun changement GitHub, Ready, approval, merge, tag, release ou
déploiement n'est autorisé.

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
