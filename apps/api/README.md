# API KORA+

Fondation NestJS de Sprint 0.3 étendue par le runtime local S1.2-03C1. Les
seules fonctions métier actives sont les douze opérations d'authentification et
de session administrateur C1 ; C2 et C3 ne sont pas démarrés.

## Démarrage local

1. Copier `.env.example` vers `.env`.
2. Remplacer uniquement les valeurs locales nécessaires. `DATABASE_USER` et
   `DATABASE_PASSWORD` doivent désigner le lecteur runtime ;
   `ADMIN_DATABASE_USER` et `ADMIN_DATABASE_PASSWORD` doivent désigner le
   writer administratif provisionné par `infra:up` ou `infra:check`. Les deux
   identités et secrets sont distincts, et ne désignent jamais le
   propriétaire/migrateur.
3. Depuis la racine du dépôt, exécuter `npm.cmd run db:generate --workspace
@kora-plus/api` sous Windows.
4. Exécuter `npm.cmd run start:dev --workspace @kora-plus/api`.

L’API écoute sur l’hôte et le port validés par la configuration. Les routes
applicatives sont sous le préfixe `/api/v1`. Les health checks
d’infrastructure restent volontairement à la racine.

## Health checks

- `GET /health/live` confirme uniquement que le processus répond.
- `GET /health/ready` sonde PostgreSQL et Redis à la demande.

La readiness répond `503` avec l’état séparé de chaque dépendance si l’une
d’elles est indisponible. PostgreSQL est connecté par Prisma et par le pool
writer au démarrage pour attester les deux frontières de privilèges ; Redis et
BullMQ restent paresseux.

## Configuration

Les variables suivantes sont validées avant le démarrage :

- `NODE_ENV`
- `API_HOST`, `API_PORT`
- `LOG_LEVEL`
- `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`,
  `DATABASE_PASSWORD`, `DATABASE_SSL`
- `ADMIN_DATABASE_HOST`, `ADMIN_DATABASE_PORT`, `ADMIN_DATABASE_NAME`,
  `ADMIN_DATABASE_USER`, `ADMIN_DATABASE_PASSWORD`, `ADMIN_DATABASE_SSL`
- `ADMIN_ORIGIN`
- `ADMIN_REDIS_HOST`, `ADMIN_REDIS_PORT`, `ADMIN_REDIS_PASSWORD` facultatif,
  `ADMIN_REDIS_TLS`, `ADMIN_REDIS_WAIT_AOF_TIMEOUT_MS`
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` facultatif, `REDIS_TLS`
- `READINESS_TIMEOUT_MS`

Les messages de validation citent uniquement les noms des variables invalides,
jamais leur valeur.

## Frontière PostgreSQL runtime

L’API construit un pool lecteur `pg`, utilisé par Prisma 7.9.1 via
`@prisma/adapter-pg` 7.9.1, et un pool writer C1 distinct. La readiness agrège
leurs probes. Avant `application.init()`, elle atteste les deux connexions et
refuse le démarrage si le compte reçu :

- diffère de l’identité de session ou possède un attribut administratif ;
- hérite d’un rôle, détient un membership ou possède un objet dans un schéma
  non système de la base courante ;
- peut créer dans la base ou un schéma non système, créer des objets
  temporaires, écrire une table, une colonne ou une vue, exécuter `MAINTAIN`,
  utiliser une séquence ou exécuter une routine ;
- possède un large object ou peut le lire, le modifier ou le tronquer,
  directement ou via `PUBLIC`, avec ou sans option de redélégation ;
- dispose sur `pg_catalog.pg_largeobject` d’un droit de relation ou de colonne,
  ou sur `pg_largeobject_metadata` d’un droit autre que le `SELECT` système
  standard non redélégable ;
- peut exécuter une routine `pg_catalog` de large objects, notamment
  `lo_create`, `lo_from_bytea`, `lo_put`, `lo_open` ou l’interface `lo_*` ;
- observe `lo_compat_privileges=on`, qui désactive les contrôles ACL attendus ;
- dispose de `SET` ou `ALTER SYSTEM` sur un paramètre PostgreSQL, directement
  ou via `PUBLIC`, avec ou sans option de redélégation ;
- démarre avec `session_replication_role` différent de `origin` ;
- reçoit un droit inattendu via `PUBLIC`.

Le profil lecteur accepté est limité à `CONNECT`, `USAGE` sur `public` et au
`SELECT` des colonnes de projection C1. Le pool writer doit utiliser une
identité et un secret distincts, ne reçoit que les privilèges de colonnes C1 et
ne peut qu’insérer dans les sinks d’audit, sans `RETURNING`. Tout autre schéma
non système doit rester inaccessible aux rôles runtime. Les privilèges courants
et par défaut sur leurs objets, colonnes, séquences, routines, large objects et
paramètres sont inspectés avant le démarrage. Aucune default ACL de table n'est
accordée aux rôles lecteur ou writer ; une ACL par défaut tierce hors profil est
refusée sans mutation. Les default ACL de large objects du propriétaire sont
normalisées ; celles d’un tiers sont refusées sans mutation. L’exécution des
routines `pg_catalog` de large objects est
révoquée pour `PUBLIC` et le runtime ; une ACL directe du runtime ou une option
de redélégation inattendue est refusée avant mutation. Les erreurs contiennent
seulement des codes de violation, jamais un identifiant, mot de passe ou DSN.

## Prisma et BullMQ

Le schéma Prisma canonique de 39 modèles est matérialisé par les deux migrations
historiques S1.2-02, puis par l’unique migration S1.2-03C1. Cette dernière crée
les six modèles d’authentification administrative et renforce l’audit sans
réécrire les lignes historiques. Le validateur
`prisma/validate-baseline.mjs` exige un PostgreSQL éphémère local explicitement
marqué, crée deux bases isolées, prouve leur reproductibilité et ne supprime que
ces deux bases.

S1.2-03A conserve son adaptateur de lecture et sa frontière de démarrage.
S1.2-03C1 ajoute un writer PostgreSQL séparé, transactionnel et strictement
borné aux colonnes autorisées, sans élargir le rôle de lecture. Le rate limit
C1 utilise un client Redis dédié, distinct de BullMQ, sans offline queue ni
retry illimité. BullMQ conserve sa configuration Redis sans queue, worker ou
job.

## Commandes

- `npm.cmd run format --workspace @kora-plus/api`
- `npm.cmd run lint --workspace @kora-plus/api`
- `npm.cmd run typecheck --workspace @kora-plus/api`
- `npm.cmd test --workspace @kora-plus/api`
- `npm.cmd run build --workspace @kora-plus/api`
- `npm.cmd run db:generate --workspace @kora-plus/api`
- `powershell -NoProfile -ExecutionPolicy Bypass -File
apps/api/prisma/run-admin-auth-runtime-validation.ps1` : exécute les scénarios
  PostgreSQL 18.4 historiques puis fresh, compare leurs catalogues, prouve les
  contraintes, triggers et ACL reader/writer C1, puis exerce les routes HTTP
  avec PostgreSQL, Redis et clés éphémères réels ;
- `powershell -NoProfile -ExecutionPolicy Bypass -File
apps/api/prisma/run-runtime-boundary-validation.ps1` : build API, crée un conteneur
  PostgreSQL 18.4 isolé en `tmpfs`, applique les migrations existantes sous
  deux propriétaires distincts, exécute par base 52 provisionnements réussis,
  43 refus déterministes sans mutation, quatre réparations de `WITH GRANT
OPTION`, une normalisation de default ACL de large objects et douze refus
  `42501`, vérifie Prisma, les types, les paramètres, les large objects, leurs
  catalogues et routines `pg_catalog`, `lo_compat_privileges`, les réglages
  persistants de session et tous les schémas non système, puis supprime
  uniquement les ressources créées. Douze ACL de catalogue brutes sont
  appliquées puis refusées par l’API et le provisionneur sur chaque base : sept
  grants deviennent effectifs, deux restent non effectifs malgré leur ACL
  persistée et trois `SELECT` de métadonnées sont redondants avec la visibilité
  système standard de `PUBLIC` ;
- `powershell -File apps/api/prisma/run-baseline-validation.ps1` depuis la
  racine : crée le conteneur PostgreSQL 18.4 au digest verrouillé, en `tmpfs` et
  sur un port loopback aléatoire, exécute les deux bases du validateur, puis
  supprime uniquement ce conteneur ;
- `node apps/api/prisma/validate-baseline.mjs` reste le validateur interne et
  refuse de s’exécuter sans `S1202_EPHEMERAL_POSTGRES=1` et une connexion
  administrateur PostgreSQL locale éphémère.
