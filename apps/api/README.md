# API KORA+

Fondation NestJS de Sprint 0.3. Cette application ne contient aucune fonction
métier.

## Démarrage local

1. Copier `.env.example` vers `.env`.
2. Remplacer uniquement les valeurs locales nécessaires.
3. Depuis la racine du dépôt, exécuter `npm.cmd run db:generate --workspace
@kora-plus/api` sous Windows.
4. Exécuter `npm.cmd run start:dev --workspace @kora-plus/api`.

L’API écoute sur l’hôte et le port validés par la configuration. Toutes les
routes sont sous le préfixe `/api/v1`.

## Health checks

- `GET /api/v1/health/live` confirme uniquement que le processus répond.
- `GET /api/v1/health/ready` sonde PostgreSQL et Redis à la demande.

La readiness répond `503` avec l’état séparé de chaque dépendance si l’une
d’elles est indisponible. PostgreSQL, Redis et BullMQ ne se connectent pas au
démarrage de l’application.

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

## Prisma et BullMQ

Le schéma Prisma cible PostgreSQL mais ne contient aucun modèle et aucune
migration. BullMQ reçoit une configuration Redis partagée sans queue, worker ou
job. Ces frontières seront étendues uniquement par un lot autorisé.

## Commandes

- `npm.cmd run format --workspace @kora-plus/api`
- `npm.cmd run lint --workspace @kora-plus/api`
- `npm.cmd run typecheck --workspace @kora-plus/api`
- `npm.cmd test --workspace @kora-plus/api`
- `npm.cmd run build --workspace @kora-plus/api`
- `npm.cmd run db:generate --workspace @kora-plus/api`
