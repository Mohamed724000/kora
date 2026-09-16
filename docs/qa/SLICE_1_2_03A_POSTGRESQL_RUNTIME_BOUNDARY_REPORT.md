# S1.2-03A — PostgreSQL Least-Privilege Runtime Boundary & Prisma Adapter

Date : 2026-09-16
État : **PREUVE LOCALE PRÉPUBLICATION VALIDÉE — PUBLICATION DRAFT AUTORISÉE — NON FUSIONNÉ**

## Baseline et autorisation

Le lot part exclusivement du merge `main`
`95bdfcf30a14e05ae90b09150cf289e1e0343c0d`, arbre
`af11ef1a758fa35585fb6c93bc82b13372107979`, parents ordonnés :

1. `4a1f4306871cac661fa12d4f326495fc43cddbb4` ;
2. `c94e285db61fd097b0bca8fe49b55412c8db8fe8`.

La PR #44 est fusionnée et fermée. Les workflows `push/main` sur ce merge sont
tous `completed/success` : Infrastructure `35082285457`, Launcher Windows
`35082285515`, Security `35082285620` et Quality Linux `35082285461`.

Le travail local est isolé sur la branche
`feat/s1-2-03a-postgresql-runtime-boundary` et un worktree dédié. Les anciens
worktrees ne sont ni réutilisés ni modifiés.

## Frontière livrée

- le compte PostgreSQL propriétaire/migrateur reste distinct du rôle API ;
- le rôle runtime est `LOGIN`, `NOINHERIT`, sans superuser, création de rôle ou
  base, réplication, contournement RLS, membership ou propriété ;
- les seuls droits attendus sont `CONNECT` sur la base, `USAGE` sur le schéma
  `public` et `SELECT` sur les tables ;
- les droits de `PUBLIC` sont révoqués sur la base, le schéma, les tables,
  colonnes, vues, séquences et routines, y compris dans les privilèges par
  défaut globaux et propres au schéma ;
- Prisma 7.9.1 utilise `@prisma/adapter-pg` 7.9.1 sur le pool runtime partagé
  avec la readiness ;
- avant `application.init()`, l’API exécute `SELECT 1`, inspecte les catalogues
  et refuse tout compte ou droit inattendu ;
- les erreurs de frontière ne contiennent que des codes de violation.

La configuration locale génère deux secrets ignorés distincts. Le secret
runtime est monté comme fichier Compose et n’est ni rendu dans la configuration
ni placé dans un argument de processus.

## Gate `@prisma/adapter-pg`

Le contrôle a été effectué avant toute installation de `node_modules`.

| Contrôle            | Résultat                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| Registre            | `https://registry.npmjs.org/`                                                                                 |
| Version             | `@prisma/adapter-pg` 7.9.1, alignée avec `prisma` et `@prisma/client` 7.9.1                                   |
| Provenance          | dépôt `https://github.com/prisma/prisma.git`, tarball npm officiel, intégrité SHA-512, attestation SLSA npm   |
| Licence directe     | Apache-2.0                                                                                                    |
| Graphe ajouté       | `@prisma/driver-adapter-utils` 7.9.1 (Apache-2.0), `postgres-array` 3.0.4 (MIT), `pg` 8.22.0 dédupliqué (MIT) |
| Audit lock candidat | 1 234 dépendances, zéro vulnérabilité `info/low/moderate/high/critical`                                       |
| Installation        | `npm ci --ignore-scripts`, 1 147 paquets audités, zéro vulnérabilité                                          |

Les avertissements de dépréciation émis pendant `npm ci` concernent des
transitives déjà présentes dans le graphe global ; l’audit final reste à zéro.
Ces contrôles supply-chain appartiennent à l’instantané local prépublication du
2026-09-16. Les corrections de contre-revue n’ont modifié ni
`apps/api/package.json` ni `package-lock.json` après ces contrôles ; installation,
audits, signatures et licences n’ont donc pas été rejoués après la dernière
correction.

## Preuve PostgreSQL réelle

`powershell -NoProfile -ExecutionPolicy Bypass -File
apps/api/prisma/run-runtime-boundary-validation.ps1` construit l’API puis démarre un
PostgreSQL 18.4 au tag et digest verrouillés, sur loopback et stockage `tmpfs`.
Le secret administrateur est un fichier temporaire monté en lecture seule.

Deux bases indépendantes sont créées. Chacune reçoit :

1. un propriétaire/migrateur non utilisé par l’API ;
2. un rôle runtime distinct, absent sur A et volontairement privilégié,
   membre du rôle propriétaire et doté d’ACL excessives sur B ;
3. les deux migrations S1.2-02 existantes ;
4. trois exécutions du provisionneur livré et monté en lecture seule : les deux
   premières produisent une signature identique couvrant ACL courantes, ACL par
   défaut, attributs, memberships et paramètres de rôle ; la troisième répare
   une dérive de privilège de colonne détectée par le démarrage API ;
5. une connexion `pg`, `SELECT 1`, une lecture Prisma de `Customer` et le
   démarrage réel de l’API avec le rôle runtime ;
6. un essai de démarrage API avec le propriétaire, obligatoirement refusé.

Résultats identiques sur A et B : 34 tables lisibles, zéro violation de droits
table, colonne, vue, `MAINTAIN`, séquence ou routine, zéro membership,
propriété ou droit `PUBLIC`. Une table, sa séquence et une fonction créées après
provisioning confirment également les ACL par défaut minimales.

| Opération runtime interdite | Résultat A | Résultat B |
| --------------------------- | ---------- | ---------- |
| `CREATE TABLE`              | `42501`    | `42501`    |
| `TRUNCATE`                  | `42501`    | `42501`    |
| désactivation de trigger    | `42501`    | `42501`    |
| `SET ROLE` propriétaire     | `42501`    | `42501`    |
| `INSERT` métier             | `42501`    | `42501`    |
| `UPDATE` métier             | `42501`    | `42501`    |
| `DELETE` métier             | `42501`    | `42501`    |

Après validation, seules les deux bases, les quatre rôles, le conteneur et les
deux fichiers secrets créés par l’essai sont supprimés. Le nettoyage tente
chaque cible même si une autre suppression échoue. Aucun volume nommé, réseau,
image ou ressource étrangère n’est supprimé.

## Validations

| Validation                         | Résultat courant                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------- |
| Prisma Client 7.9.1 generate       | PASS                                                                                    |
| Prettier ciblé                     | PASS                                                                                    |
| Format, lint et typecheck racine   | PASS                                                                                    |
| Tests applicatifs                  | PASS — API 26/26 rejoué après correction ; 60 tests des workspaces inchangés déjà verts |
| Tests d’outillage                  | PASS — 296/296 rejoués après correction                                                 |
| Builds                             | PASS — API rejoué ; Web, Admin, Contracts, Config, UI et Android inchangés déjà verts   |
| Compose rendu et absence de secret | PASS                                                                                    |
| Upgrade `infra:prepare` historique | PASS — valeurs préservées, clé runtime ajoutée une fois, second passage identique       |
| Validation réelle sur deux bases   | PASS — script livré, 3 passages/base, dérive réparée, 14 refus `42501`                  |
| Audits npm complet et production   | PASS pré-correction — zéro vulnérabilité ; graphe inchangé, non rejoué ensuite          |
| Signatures et attestations npm     | PASS pré-correction — 1 132 signatures, 198 attestations ; non rejoué ensuite           |
| Licences npm                       | PASS pré-correction — 1 134 paquets, zéro écart ; graphe inchangé, non rejoué ensuite   |
| Scanner officiel                   | PASS — 353 fichiers, historique et 52 sources immuables contrôlés                       |
| Workflows et OpenAPI               | PASS — 4 workflows, 4 actions verrouillées ; 34 chemins, 87 schémas, 18 invariants      |

Le premier lancement post-reprise s’est arrêté avant création de conteneur car
Docker Desktop était arrêté ; ses deux fichiers secrets temporaires ont été
supprimés. Docker démarré, la reprise complète ci-dessus a réussi et n’a laissé
aucune ressource de validation.

## Contre-revues indépendantes

1. Architecture/données : le provisionneur livré n’était pas celui exécuté,
   les ACL par défaut runtime et la signature d’idempotence étaient
   incomplètes. Le validateur monte désormais le script exact, teste création
   et convergence, puis signe ACL courantes/par défaut, rôle, memberships et
   paramètres.
2. Sécurité/intégrité : les ACL par défaut globales de `PUBLIC`, les privilèges
   de colonne/vue/`MAINTAIN`, le passage d’un secret dans `argv` et la poursuite
   du nettoyage après erreur étaient incomplets. Les quatre points sont
   corrigés et couverts par la preuve réelle.
3. Gouvernance/reproductibilité : le manifeste racine sortait du périmètre,
   l’upgrade d’un ancien `compose.env` échouait et deux formulations de preuve
   étaient trop larges. Le manifeste racine est inchangé, l’upgrade est
   idempotent et les documents décrivent l’artefact réellement testé.

Après réconciliation, aucune contre-revue ne conserve de finding fondé ouvert.

## Limites explicites

- aucun endpoint, service métier, worker, queue, seed ou interface n’est livré ;
- aucun droit d’écriture métier n’est accordé au rôle runtime ;
- `schema.prisma`, les migrations S1.2-02, OpenAPI, les contrats générés et les
  workflows restent inchangés ;
- le build iOS reste `NON EXÉCUTÉ` sur Windows ; aucun changement mobile ne
  rend son exécution applicable à ce lot ;
- le provisioning de production et tout rôle d’écriture futur sont hors
  périmètre ; ils exigent une autorisation, un rôle distinct et des tests
  propres ;
- l’instantané local prépublication du 2026-09-16 a été établi sans commit,
  push, PR, Ready, merge, tag, release ou déploiement ; la publication Draft
  ultérieurement autorisée ne vaut ni Ready, ni merge, ni démarrage de
  S1.2-03B.
