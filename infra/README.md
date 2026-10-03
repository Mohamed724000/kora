# Infrastructure locale KORA+

Cette zone contient uniquement la pile locale Sprint 0.4 : PostgreSQL et
Redis. Elle ne décrit aucune topologie de staging ou de production.

## Pile verrouillée

- projet Compose : `kora-plus-local` ;
- PostgreSQL : `postgres:18.4-alpine3.24` avec digest verrouillé ;
- Redis : `redis:7.2.15-alpine3.21` avec digest verrouillé ;
- réseau : `kora-plus-local-network` ;
- volumes : `kora-plus-local-postgres-data` et
  `kora-plus-local-redis-data` ;
- exposition hôte : `127.0.0.1` uniquement.

Les ports par défaut sont `15432` pour PostgreSQL et `16379` pour Redis. Ils
peuvent être modifiés dans `infra/.local/compose.env`, fichier local ignoré par
Git. L’API de vérification utilise par défaut le port `3102`.

### Instance éphémère isolée

Le comportement par défaut ci-dessus reste inchangé. Pour une validation
jetable, `KORA_INFRA_EPHEMERAL_INSTANCE` accepte un identifiant Docker
minuscule validé et dérive un projet, deux volumes, un réseau et un répertoire
de secrets distincts sous `infra/.local/instances/<instance>/`. Les trois ports
sont fournis séparément par `KORA_INFRA_POSTGRES_PORT`,
`KORA_INFRA_REDIS_PORT` et `KORA_INFRA_API_PORT`.

Lors de la première préparation d’une instance éphémère, les conteneurs,
volumes et réseau dérivés doivent être absents. Compose reçoit explicitement
les noms et le répertoire isolés ; une option `-p` seule ne constitue pas cette
garantie. Le gate historique `infra:verify` peut utiliser sa confirmation
littérale uniquement si l’instance n’est pas `local` et si
`KORA_INFRA_ALLOW_LEGACY_LIFECYCLE_CONFIRMATION=true` est fourni
explicitement. La suppression reste alors limitée aux deux volumes dérivés,
après vérification de leurs labels. Cette option ne modifie pas la confirmation
du reset CLI, qui reste le nom exact du projet courant.

## Secrets locaux

`npm run infra:prepare` génère des valeurs aléatoires dans
`infra/.local/secrets/` et une configuration locale dans
`infra/.local/compose.env`. Les fichiers existants ne sont jamais écrasés. Pour
une configuration antérieure à S1.2-03C1, les clés absentes
`KORA_POSTGRES_RUNTIME_USER=kora_runtime` et
`KORA_POSTGRES_ADMIN_WRITER_USER=kora_admin_writer` sont ajoutées en fin de
fichier sans modifier les valeurs déjà présentes.

PostgreSQL reçoit trois secrets distincts : `postgres_password` pour le compte
local propriétaire/migrateur, `postgres_runtime_password` pour le lecteur de
l’API et `postgres_admin_writer_password` pour son writer administratif. Les
deux secrets runtime ne sont jamais injectés comme variables Compose ni
arguments de processus ; le provisionneur les lit depuis `/run/secrets`.
Redis reçoit également son secret comme fichier Compose et construit une
configuration privée dans un `tmpfs` interne.

`infra:up` applique d'abord les migrations Prisma sous l'identité locale
propriétaire/migrateur, puis `infra:up` et `infra:check` rejouent le
provisionneur idempotent. Le rôle
`KORA_POSTGRES_RUNTIME_USER` et `KORA_POSTGRES_ADMIN_WRITER_USER` sont
`NOINHERIT`, sans attribut administratif ni membership. Le lecteur est limité
à `CONNECT`, `USAGE` du schéma `public` et aux colonnes de projection C1. Le
writer reçoit uniquement les privilèges de colonnes nécessaires aux commandes
administratives ; `AuditLog` et `AdminSecurityEvent` sont des sinks
`INSERT`-only. Les droits de `PUBLIC`, les écritures non prévues,
colonnes, vues, `MAINTAIN`, séquences, routines, types, large objects, options de
redélégation, DDL et objets temporaires sont révoqués, y compris dans les
privilèges par défaut. Tout droit `SET` ou `ALTER SYSTEM` sur un paramètre
PostgreSQL accordé directement au runtime ou à `PUBLIC`, y compris avec option
de redélégation, est interdit. Toute nouvelle connexion runtime doit aussi
hériter de `session_replication_role=origin` et de
`lo_compat_privileges=off`. Les routines `pg_catalog` de large objects sont
retirées à `PUBLIC` et au runtime, ce qui bloque notamment `lo_create`,
`lo_from_bytea`, `lo_put` et `lo_open`. Le compte
`KORA_POSTGRES_USER` reste réservé aux migrations locales et ne doit jamais
être fourni à l’API. Les deux identités runtime et leurs secrets doivent rester
distincts entre eux et du propriétaire.

Avant de normaliser les ACL du périmètre `public`, le provisionneur inspecte
tous les schémas non système de la base courante. Un schéma tiers possédé ou
accessible par le runtime, un objet possédé dans `public` ou ailleurs, un
`CREATE` hérité de `PUBLIC`, un privilège d’objet/colonne/séquence/routine/type,
une option de redélégation, un large object possédé ou accessible, ou une ACL
par défaut hors profil — y compris celle d’un propriétaire tiers dans `public` —
provoque un refus non nul avec un diagnostic borné sans secret. Les large
objects, qui sont hors schéma, sont inspectés directement dans
`pg_largeobject_metadata`; les ACL des routines `pg_catalog` correspondantes
ainsi que les ACL relationnelles et de colonnes de `pg_largeobject` et
`pg_largeobject_metadata` sont inspectées séparément. Le runtime ne peut avoir
aucun droit sur `pg_largeobject`. Sur `pg_largeobject_metadata`, seul le
`SELECT` système standard de `PUBLIC`, sans redélégation, est admis ; tout droit
d’écriture, de colonne, de redélégation, direct ou hérité par rôle est refusé
avant mutation. Le script ne réattribue pas la propriété et ne
réécrit pas les ACL tierces de ces objets ou routines : leur correction exige
une décision explicite du propriétaire de la base. Toutes les mutations du rôle, du
credential et des ACL sont dans la même transaction : un refus restaure l’état
antérieur complet.

Les ACL de paramètres sont globales au cluster. Le provisionneur les contrôle
avant toute mutation et refuse avec un diagnostic borné sans secret ; il ne les
révoque jamais automatiquement. Dans `public`, le provisionneur retire les
anciens droits relationnels et default ACL de table des rôles runtime avant
d'accorder les projections de colonnes C1. Une ACL par défaut hors profil créée
par un rôle tiers est refusée sans modification ; sa remédiation reste sous
l’autorité de ce propriétaire tiers. La même règle s’applique aux default ACL
PostgreSQL 18 de
large objects : celles du propriétaire/migrateur sont normalisées, celles d’un
tiers sont refusées avant mutation. Les réglages `pg_db_role_setting` aux
portées base, rôle et rôle/base qui imposent
`session_replication_role!=origin` sont refusés avant mutation et ne sont jamais
corrigés silencieusement. La même inspection couvre
`lo_compat_privileges!=off`, y compris sa valeur effective sur la connexion du
provisionneur ; ce mode dangereux est refusé plutôt que normalisé. Tout
override propriétaire/migrateur de l’un de ces deux paramètres est refusé,
même s’il affiche une valeur sûre : sur cette connexion, il pourrait masquer un
défaut cluster dangereux hérité par le runtime. Le provisionneur ne tente pas
de supprimer cet override ; la remédiation explicite doit établir le défaut
global sûr puis retirer la portée masquante.

Ces identifiants sont exclusivement locaux. Ils ne doivent jamais être copiés
dans un fichier versionné ou un environnement partagé.

## Commandes

Sous Windows, utiliser `npm.cmd` :

| Commande                       | Effet                                                    |
| ------------------------------ | -------------------------------------------------------- |
| `npm.cmd run infra:prepare`    | Crée les fichiers locaux ignorés sans écraser l’existant |
| `npm.cmd run infra:validate`   | Valide Compose et ses invariants sans afficher de secret |
| `npm.cmd run infra:pull`       | Télécharge seulement les deux images verrouillées        |
| `npm.cmd run infra:up`         | Démarre, migre puis provisionne les rôles runtime        |
| `npm.cmd run infra:status`     | Affiche uniquement l’état du projet local                |
| `npm.cmd run infra:check`      | Vérifie la pile et reprovisionne la frontière runtime    |
| `npm.cmd run infra:down`       | Arrête la pile sans supprimer les volumes                |
| `npm.cmd run infra:verify`     | Vérifie persistance, reset ciblé et idempotence          |
| `npm.cmd run infra:verify-api` | Vérifie les probes API et les pannes contrôlées          |

Le reset destructif des deux volumes exige la confirmation exacte :

```powershell
npm.cmd run infra:reset -- --confirm=kora-plus-local
```

Le script vérifie noms et labels, affiche les deux volumes ciblés, refuse tout
écart, ne supprime aucune image et compare les ressources étrangères avant et
après l’opération. Les commandes globales de prune ne sont jamais utilisées.

Pour arrêter sans perdre les données :

```powershell
npm.cmd run infra:down
```

Un démarrage ultérieur avec `infra:up` réutilise les volumes nommés.
