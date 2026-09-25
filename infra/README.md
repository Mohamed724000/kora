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

## Secrets locaux

`npm run infra:prepare` génère des valeurs aléatoires dans
`infra/.local/secrets/` et une configuration locale dans
`infra/.local/compose.env`. Les fichiers existants ne sont jamais écrasés. Pour
une configuration antérieure à S1.2-03A, la seule clé absente
`KORA_POSTGRES_RUNTIME_USER=kora_runtime` est ajoutée en fin de fichier sans
modifier les valeurs déjà présentes.

PostgreSQL reçoit deux secrets distincts : `postgres_password` pour le compte
local propriétaire/migrateur et `postgres_runtime_password` pour l’API. Le
second n’est jamais injecté comme variable Compose ni argument de processus ;
le provisionneur le lit depuis `/run/secrets`. Redis reçoit également son
secret comme fichier Compose et construit une configuration privée dans un
`tmpfs` interne.

`infra:up` et `infra:check` rejouent le provisionneur idempotent. Le rôle
`KORA_POSTGRES_RUNTIME_USER` est `NOINHERIT`, sans attribut administratif ni
membership ; ses droits effectifs sont limités à `CONNECT`, `USAGE` du schéma
`public` et `SELECT` sur les tables. Les droits de `PUBLIC`, les écritures,
colonnes, vues, `MAINTAIN`, séquences, routines, types, options de redélégation,
DDL et objets temporaires sont révoqués, y compris dans les privilèges par
défaut. Tout droit `SET` ou `ALTER SYSTEM` sur un paramètre PostgreSQL accordé
directement au runtime ou à `PUBLIC`, y compris avec option de redélégation,
est interdit. Le compte
`KORA_POSTGRES_USER` reste réservé aux migrations locales et ne doit jamais
être fourni à l’API.

Avant de normaliser les ACL du périmètre `public`, le provisionneur inspecte
tous les schémas non système de la base courante. Un schéma tiers possédé ou
accessible par le runtime, un objet possédé dans `public` ou ailleurs, un
`CREATE` hérité de `PUBLIC`, un privilège d’objet/colonne/séquence/routine/type,
une option de redélégation ou une ACL par défaut hors profil — y compris celle
d’un propriétaire tiers dans `public` — provoque un refus non nul avec un
diagnostic borné sans secret. Le script ne réattribue pas la propriété et ne
réécrit pas les ACL de ces schémas préexistants : leur correction exige une
décision explicite du propriétaire de la base. Toutes les mutations du rôle,
du credential et des ACL sont dans la même transaction : un refus restaure
l’état antérieur complet.

Les ACL de paramètres sont globales au cluster. Le provisionneur les contrôle
avant toute mutation et refuse avec un diagnostic borné sans secret ; il ne les
révoque jamais automatiquement. Dans `public`, le `SELECT` par défaut destiné
au runtime n’est réparable que lorsqu’il appartient explicitement au
propriétaire de la base. Une ACL par défaut équivalente créée par un rôle tiers
est refusée sans modification ; sa remédiation reste sous l’autorité de ce
propriétaire tiers.

Ces identifiants sont exclusivement locaux. Ils ne doivent jamais être copiés
dans un fichier versionné ou un environnement partagé.

## Commandes

Sous Windows, utiliser `npm.cmd` :

| Commande                       | Effet                                                    |
| ------------------------------ | -------------------------------------------------------- |
| `npm.cmd run infra:prepare`    | Crée les fichiers locaux ignorés sans écraser l’existant |
| `npm.cmd run infra:validate`   | Valide Compose et ses invariants sans afficher de secret |
| `npm.cmd run infra:pull`       | Télécharge seulement les deux images verrouillées        |
| `npm.cmd run infra:up`         | Démarre, attend la santé et provisionne le rôle runtime  |
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
