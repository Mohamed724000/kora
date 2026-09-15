# API KORA+

Fondation NestJS de Sprint 0.3. Cette application ne contient aucune fonction
métier.

## Démarrage local

1. Copier `.env.example` vers `.env`.
2. Remplacer uniquement les valeurs locales nécessaires.
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

Le schéma Prisma canonique de 33 modèles est matérialisé par les deux migrations
S1.2-02 : la baseline générée depuis `schema.prisma`, puis la couche d’intégrité
PostgreSQL (`CHECK`, index partiels, fonctions et triggers). Le validateur
`prisma/validate-baseline.mjs` exige un PostgreSQL éphémère local explicitement
marqué, crée deux bases isolées, prouve leur reproductibilité et ne supprime que
ces deux bases.

Cette baseline n’implémente aucune route métier P2. BullMQ conserve sa
configuration Redis partagée sans queue, worker ou job. Les transactions
applicatives et le runtime restent réservés à des lots ultérieurs explicitement
autorisés.

## Commandes

- `npm.cmd run format --workspace @kora-plus/api`
- `npm.cmd run lint --workspace @kora-plus/api`
- `npm.cmd run typecheck --workspace @kora-plus/api`
- `npm.cmd test --workspace @kora-plus/api`
- `npm.cmd run build --workspace @kora-plus/api`
- `npm.cmd run db:generate --workspace @kora-plus/api`
- `powershell -File apps/api/prisma/run-baseline-validation.ps1` depuis la
  racine : crée le conteneur PostgreSQL 18.4 au digest verrouillé, en `tmpfs` et
  sur un port loopback aléatoire, exécute les deux bases du validateur, puis
  supprime uniquement ce conteneur ;
- `node apps/api/prisma/validate-baseline.mjs` reste le validateur interne et
  refuse de s’exécuter sans `S1202_EPHEMERAL_POSTGRES=1` et une connexion
  administrateur PostgreSQL locale éphémère.
