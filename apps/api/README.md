# API KORA+

Fondation NestJS de Sprint 0.3. Cette application ne contient aucune fonction
métier.

## Démarrage local

1. Copier `.env.example` vers `.env`.
2. Remplacer uniquement les valeurs locales nécessaires. `DATABASE_USER` et
   `DATABASE_PASSWORD` doivent désigner le rôle runtime provisionné par
   `infra:up` ou `infra:check`, jamais le propriétaire/migrateur.
3. Depuis la racine du dépôt, exécuter `npm.cmd run db:generate --workspace
@kora-plus/api` sous Windows.
4. Exécuter `npm.cmd run start:dev --workspace @kora-plus/api`.

L’API écoute sur l’hôte et le port validés par la configuration. Les futures
routes applicatives sont sous le préfixe `/api/v1`. Les health checks
d’infrastructure restent volontairement à la racine.

## Health checks

- `GET /health/live` confirme uniquement que le processus répond.
- `GET /health/ready` sonde PostgreSQL et Redis à la demande.

La readiness répond `503` avec l’état séparé de chaque dépendance si l’une
d’elles est indisponible. PostgreSQL est connecté par Prisma au démarrage pour
attester la frontière de privilèges ; Redis et BullMQ restent paresseux.

## Configuration

Les variables suivantes sont validées avant le démarrage :

- `NODE_ENV`
- `API_HOST`, `API_PORT`
- `LOG_LEVEL`
- `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`,
  `DATABASE_PASSWORD`, `DATABASE_SSL`
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` facultatif, `REDIS_TLS`
- `READINESS_TIMEOUT_MS`

Les messages de validation citent uniquement les noms des variables invalides,
jamais leur valeur.

## Frontière PostgreSQL runtime

L’API construit un pool `pg` unique, utilisé par Prisma 7.9.1 via
`@prisma/adapter-pg` 7.9.1 et par la readiness. Avant `application.init()`, elle
exécute `SELECT 1` puis refuse le démarrage si le compte reçu :

- diffère de l’identité de session ou possède un attribut administratif ;
- hérite d’un rôle, détient un membership ou possède un objet applicatif ;
- peut créer dans la base ou le schéma, créer des objets temporaires, écrire
  une table, une colonne ou une vue, exécuter `MAINTAIN`, utiliser une séquence
  ou exécuter une routine applicative ;
- reçoit un droit inattendu via `PUBLIC`.

Le profil accepté est limité à `CONNECT`, `USAGE` sur `public` et `SELECT` sur
les tables canoniques. Les erreurs de démarrage contiennent seulement des codes
de violation, jamais un identifiant, mot de passe ou DSN.

## Prisma et BullMQ

Le schéma Prisma canonique de 33 modèles est matérialisé par les deux migrations
S1.2-02 : la baseline générée depuis `schema.prisma`, puis la couche d’intégrité
PostgreSQL (`CHECK`, index partiels, fonctions et triggers). Le validateur
`prisma/validate-baseline.mjs` exige un PostgreSQL éphémère local explicitement
marqué, crée deux bases isolées, prouve leur reproductibilité et ne supprime que
ces deux bases.

Cette baseline n’implémente aucune route métier P2. S1.2-03A ajoute uniquement
un adaptateur de lecture et une frontière de démarrage ; il n’ajoute aucun
service ou droit d’écriture métier. BullMQ conserve sa configuration Redis
partagée sans queue, worker ou job. Les transactions applicatives restent
réservées à des lots ultérieurs explicitement autorisés et devront utiliser des
rôles distincts, sans élargir le rôle de lecture.

## Commandes

- `npm.cmd run format --workspace @kora-plus/api`
- `npm.cmd run lint --workspace @kora-plus/api`
- `npm.cmd run typecheck --workspace @kora-plus/api`
- `npm.cmd test --workspace @kora-plus/api`
- `npm.cmd run build --workspace @kora-plus/api`
- `npm.cmd run db:generate --workspace @kora-plus/api`
- `powershell -NoProfile -ExecutionPolicy Bypass -File
apps/api/prisma/run-runtime-boundary-validation.ps1` : build API, crée un conteneur
  PostgreSQL 18.4 isolé en `tmpfs`, applique les migrations existantes sous
  deux propriétaires distincts, exécute trois fois le provisionneur livré pour
  prouver idempotence et récupération de dérive, vérifie Prisma et les refus de
  privilèges, puis supprime uniquement les ressources créées ;
- `powershell -File apps/api/prisma/run-baseline-validation.ps1` depuis la
  racine : crée le conteneur PostgreSQL 18.4 au digest verrouillé, en `tmpfs` et
  sur un port loopback aléatoire, exécute les deux bases du validateur, puis
  supprime uniquement ce conteneur ;
- `node apps/api/prisma/validate-baseline.mjs` reste le validateur interne et
  refuse de s’exécuter sans `S1202_EPHEMERAL_POSTGRES=1` et une connexion
  administrateur PostgreSQL locale éphémère.
