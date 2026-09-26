# S1.2-03A — PostgreSQL Least-Privilege Runtime Boundary & Prisma Adapter

Date initiale : 2026-09-16
Dernère réconciliation : 2026-09-26
État : **DRAFT PR #45 OUVERTE — R7 PUBLIÉ — QUATRE WORKFLOWS R7 RÉUSSIS — INSTANTANÉ PRÉPUBLICATION R8 VALIDÉ LOCALEMENT — NON FUSIONNÉ**

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

## Publication Draft, échecs R0/R1 historiques et R2 publié

Le commit initial publié `974d7afa9d4dc9ceb88a35bd5bd7ae3f477cb875`, parent
`95bdfcf30a14e05ae90b09150cf289e1e0343c0d`, était le head de la Draft PR #45
avant R1. Ses workflows `pull_request` initiaux ont conclu :

- Security `35119052015` : `completed/success` ;
- Infrastructure `35119052104` : `completed/failure` pendant le build API ;
- Launcher Windows `35119052049` : `completed/failure` pendant les tests API ;
- Quality Linux `35119052101` : `completed/failure` pendant le typecheck API.

Ces trois échecs R0 sont historiques.

Un clone neuf a reproduit la cause après `npm ci` :
`node_modules/.prisma/client/default.d.ts` était absent, puis TS2305 sur
`PrismaClient` entraînait trois TS2339 sur `$queryRaw` et `$disconnect`. Les
workflows exécutent réellement build, typecheck ou tests sans commande de
génération préalable. Le correctif R1 ajoute `prebuild`, `pretypecheck` et
`pretest` dans le workspace API, tous délégués au `db:generate` existant, ainsi
qu’un test de contrat. Client supprimé avant chaque essai dans le clone, les
trois commandes régénèrent Prisma 7.9.1 et réussissent indépendamment. R1 est
intégré à la branche de la Draft PR ; aucun run initial n’est relancé et les
nouveaux workflows sont attachés à son head distinct.

Le commit R1 publié `41b3d8f33a637108814208258a3e99b105be1afc`, parent
`974d7afa9d4dc9ceb88a35bd5bd7ae3f477cb875`, était le head local, distant et de
la Draft PR #45 avant R2. Ses workflows `pull_request` ont conclu :

- Launcher Windows `35155026009` : `completed/success` ;
- Security `35155025993` : `completed/success` ;
- Quality Linux `35155026016` : `completed/success` ;
- Infrastructure `35155026285` : `completed/failure` dans
  « Build and verify API health transitions ».

L’échec Infrastructure R1 est historique.

Le log Infrastructure complet montre que préparation, validation, pull, cycle
de vie, génération Prisma 7.9.1 et build API réussissent. Le provisionneur crée
et vérifie aussi le rôle runtime. L’ancien `verify-api-health.mjs` transmettait
cependant au processus API `KORA_POSTGRES_USER` avec `postgres_password`. L’API
sortait avec le code 1 ; le script n’inspectait pas cette sortie et concluait
seulement après 30 secondes : `API did not respond within 30000ms`.

Une reproduction PostgreSQL isolée, secrets neutralisés, capture la cause
exacte : `RuntimeDatabaseBoundaryError` avec les violations
`administrative_role_attribute`, `role_inheritance_enabled`,
`runtime_owns_database_object`, `database_or_schema_write_privilege`,
`unexpected_table_privilege` et `unexpected_routine_privilege`. Ce refus du
propriétaire/migrateur est le comportement de sécurité attendu.

Dans son instantané local du 2026-09-16 antérieur au commit, le correctif R2 :

1. exécute `prisma migrate deploy` sous le propriétaire/migrateur sur le runner
   neuf ;
2. reprovisionne le rôle runtime et ses ACL après les migrations ;
3. exige explicitement que l’API refuse le propriétaire pour les violations
   privilégiées attendues ;
4. lance le processus API avec `KORA_POSTGRES_RUNTIME_USER` et
   `postgres_runtime_password` ;
5. détecte une sortie prématurée du processus et joint immédiatement un extrait
   fatal borné, après neutralisation des secrets et URL de connexion.

Le garde API, le provisionneur, les droits PostgreSQL et les migrations restent
inchangés. Aucun droit propriétaire n’est accordé au rôle runtime. Ces résultats
locaux constituent une preuve historique antérieure à la publication R2 et ne
préjugeaient pas alors du résultat de ses workflows.

R2 a ensuite été publié au commit
`9d163cc34caa57cd671b6783048d89dde6d18069`, parent
`41b3d8f33a637108814208258a3e99b105be1afc`. Les quatre workflows
`pull_request` ont conclu sur ce head exact :

- Infrastructure `35162113781` : `completed/success` ;
- Launcher Windows `35162113686` : `completed/success` ;
- Security `35162113920` : `completed/success` ;
- Quality Linux `35162113691` : `completed/success`.

La PR #45 reste ouverte, Draft et non fusionnée. Aucun passage en Ready ou
merge n’a été effectué et S1.2-03B reste `Not started`.

L’instantané local prépublication de la réconciliation R3 du 2026-09-17 a été
établi alors qu’aucun commit, push, changement de PR, rerun, Ready ou merge R3
n’avait été effectué ; aucun SHA ou Run ID R3 futur n’y était affirmé.

R3 a ensuite été publié au commit
`8f8c447b9badd3c8bd330982a1c0e7ef38e246cf`, parent
`9d163cc34caa57cd671b6783048d89dde6d18069`. Infrastructure `35209186465`,
Launcher Windows `35209186447`, Security `35209186482` et Quality Linux
`35209186464` sont tous `pull_request/completed/success` sur ce head exact.

La revue CTO post-R3 a conclu `BLOCK` sur deux findings. Le corps de la PR
portait pour R1 `+116/-42` au lieu du résultat Git et GitHub `+118/-42` ;
l’unique correction autorisée a été appliquée sans changer le cumul R3
`4 commits, 28 fichiers, +2761/-187`, le titre, la base, le head ou le statut
Draft. Le second finding démontrait que l’attestation était limitée à
`public`. Dans l’instantané historique prépublication du 2026-09-18, R4
corrige localement cette limite sans annoncer de SHA ou Run ID futur et sans
présenter ces changements comme déjà publiés à cette date.

## Frontière livrée

- le compte PostgreSQL propriétaire/migrateur reste distinct du rôle API ;
- le rôle runtime est `LOGIN`, `NOINHERIT`, sans superuser, création de rôle ou
  base, réplication, contournement RLS, membership ou propriété ;
- les seuls droits attendus sont `CONNECT` sur la base, `USAGE` sur le schéma
  `public` et `SELECT` sur les tables ;
- l’attestation inspecte tous les schémas non système de la base courante :
  toute propriété enregistrée dans la base et, hors `public`, toute ACL
  effective de schéma, table, colonne, vue, séquence, routine, type ou privilège
  par défaut est interdite ;
- les droits attendus ne portent jamais `WITH GRANT OPTION` ; la base, le schéma
  `public`, ses tables et les ACL par défaut sont contrôlés séparément ;
- les droits de `PUBLIC` sont révoqués sur la base et `public`, puis contrôlés
  sur tous les autres schémas non système et leurs objets ;
- le provisionneur refuse un état dangereux tiers avec un diagnostic borné sans
  secret, y compris une propriété dans `public` ou un default ACL d’un autre
  propriétaire ; il ne réattribue ni propriété ni ACL tierce et la signature
  avant/après refus doit rester identique ;
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
2026-09-16. Les corrections de contre-revue antérieures à la publication
n’avaient modifié ni `apps/api/package.json` ni `package-lock.json`. La
correction CI R1 ultérieure modifie uniquement les scripts du manifeste API.
R2 à R6 ne changent ni dépendance ni lockfile ; audits, signatures et
licences n’ont pas été rejoués après R0 et ne sont pas présentés comme des
résultats courants R6.

## Preuve PostgreSQL réelle R6

`powershell -NoProfile -ExecutionPolicy Bypass -File
apps/api/prisma/run-runtime-boundary-validation.ps1` construit l’API puis démarre un
PostgreSQL 18.4 au tag et digest verrouillés, sur loopback et stockage `tmpfs`.
Le secret administrateur est un fichier temporaire monté en lecture seule.

Deux bases indépendantes sont créées. Chacune reçoit :

1. un propriétaire/migrateur non utilisé par l’API ;
2. un rôle runtime distinct, absent sur A et volontairement privilégié,
   membre du rôle propriétaire et doté d’ACL excessives sur B ;
3. les deux migrations S1.2-02 existantes ;
4. 23 exécutions réussies du provisionneur livré : les deux premières
   produisent une signature identique couvrant tous les schémas non système,
   ACL courantes/par défaut, options de redélégation, propriétés, attributs,
   memberships et paramètres de rôle ; la troisième répare une dérive de
   colonne dans `public`, seize passages confirment la convergence après
   réparation explicite des états refusés et quatre réparent isolément les
   options de redélégation ;
5. seize refus déterministes du provisionneur, avec diagnostic borné et signature
   inchangée : schéma possédé par le runtime, `PUBLIC CREATE`, objet `public`,
   collation, privilèges de table, colonne, séquence, routine et type, default ACL
   externe et default ACL d’un propriétaire tiers dans `public`, puis les cinq
   variantes `SET`/`ALTER SYSTEM` directes, via `PUBLIC` et avec redélégation ;
6. une connexion `pg`, `SELECT 1`, une lecture Prisma de `Customer` et le
   démarrage réel de l’API avec le rôle runtime ;
7. un essai de démarrage API avec le propriétaire, obligatoirement refusé.

Résultats identiques sur A et B : 34 tables lisibles, zéro violation de droits
table, colonne, vue, `MAINTAIN`, séquence, routine, type, paramètre ou option de
redélégation, zéro membership, propriété ou droit `PUBLIC`. Un schéma tiers sain
reste inaccessible. Des tables, séquences, fonctions et types créés après
provisioning dans `public` et ce schéma confirment les ACL par défaut minimales.
Les seize états dangereux sont isolément refusés par le démarrage API et le
provisionneur sur A et B, sans mutation de leur signature.

| Opération runtime interdite    | Résultat A | Résultat B |
| ------------------------------ | ---------- | ---------- |
| `CREATE TABLE`                 | `42501`    | `42501`    |
| `TRUNCATE`                     | `42501`    | `42501`    |
| désactivation de trigger       | `42501`    | `42501`    |
| `SET ROLE` propriétaire        | `42501`    | `42501`    |
| `SET session_replication_role` | `42501`    | `42501`    |
| `INSERT` métier                | `42501`    | `42501`    |
| `UPDATE` métier                | `42501`    | `42501`    |
| `DELETE` métier                | `42501`    | `42501`    |
| `lo_create`                    | `42501`    | `42501`    |
| `lo_from_bytea`                | `42501`    | `42501`    |
| `lo_put`                       | `42501`    | `42501`    |
| `lo_open`                      | `42501`    | `42501`    |

Après validation, seules les deux bases, les six rôles, le conteneur et les
deux fichiers secrets créés par l’essai sont supprimés. Le nettoyage tente
chaque cible même si une autre suppression échoue. Aucun volume nommé, réseau,
image ou ressource étrangère n’est supprimé.

## Validations — preuves courantes et historiques qualifiées

| Validation                         | Résultat et portée                                                                           |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| Prisma Client 7.9.1 generate       | PASS R8                                                                                      |
| Prettier ciblé                     | PASS R8                                                                                      |
| Typecheck API après correction     | PASS — `pretypecheck` génère Prisma 7.9.1 avant `tsc`                                        |
| Tests applicatifs                  | PASS R8 — API 27/27 ; aucun autre workspace applicatif touché                                |
| Tests d’outillage                  | PASS R8 — 303/303, dont le contrat de génération Prisma en checkout propre                   |
| Builds                             | PASS R8 — API construit ; autres applications inchangées                                     |
| Compose rendu et absence de secret | PASS historique — non rejoué en R8                                                           |
| Upgrade `infra:prepare` historique | PASS historique — valeurs préservées, clé runtime ajoutée une fois, second passage identique |
| Validation réelle sur deux bases   | PASS R8 — 104 succès, 86 refus inchangés, 8 grant options réparées, 24 refus `42501`         |
| Audits npm complet et production   | NON REJOUÉ R8 — preuve antérieure à zéro vulnérabilité ; graphe inchangé                     |
| Signatures et attestations npm     | NON REJOUÉ R8 — preuve antérieure de 1 132 signatures et 198 attestations                    |
| Licences npm                       | NON REJOUÉ R8 — preuve antérieure de 1 134 paquets sans écart ; graphe inchangé              |
| Scanner officiel                   | PASS R8 — 355 fichiers, historique et 52 sources immuables contrôlés                         |
| Workflows et OpenAPI               | PASS R8 via outillage — politique locale et contrat existant inchangé                        |
| Reproduction CI avant correction   | PASS historique R1 — clone neuf, client absent ; TS2305 et trois TS2339 reproduits           |
| Correction CI en clone neuf        | PASS historique R1 — génération indépendante avant typecheck, build et API 26/26             |
| Reproduction Infrastructure R1     | PASS historique — propriétaire transmis ; fatal `RuntimeDatabaseBoundaryError` neutralisé    |
| Correctif Infrastructure isolé     | PASS historique R2 — migrations owner, refus owner, runtime live/ready, reprises 200/503/200 |
| Confidentialité du smoke corrigé   | PASS historique — aucun secret ni URL PostgreSQL/Redis dans les sorties capturées            |
| Workflows R2 publiés               | PASS historique — quatre `pull_request/completed/success` sur `9d163cc…`                     |
| Workflows R3 publiés               | PASS historique — quatre `pull_request/completed/success` sur `8f8c447…`                     |

Le premier lancement R4 s’est arrêté avant création de conteneur car Docker
Desktop était arrêté ; ses deux fichiers secrets temporaires ont été supprimés.
Après démarrage de Docker, un premier passage a révélé qu’un `\quit 3` psql
était ignoré et laissait le provisionneur poursuivre malgré son diagnostic. Le
refus utilise désormais une erreur SQL sous `ON_ERROR_STOP`. Un passage complet
a ensuite réussi. Les contre-revues R4 ont toutefois trouvé les options de
redélégation, les ACL de types, les propriétés génériques, les default ACL tiers
et l’isolation des causes encore incomplètes. Après correction, un essai a
échoué sur la syntaxe PostgreSQL non supportée `ALL TYPES IN SCHEMA`; son
nettoyage ciblé a réussi. La révocation type par type qui l’a remplacée a passé
deux validations réelles complètes successives, dont la dernière après ajout du
contrôle post-provisionnement. Après la correction transactionnelle, une
reprise a correctement échoué parce que l’empreinte SCRAM avait été incluse
dans la signature d’idempotence alors qu’un provisionnement réussi resale le
même secret. La signature opérationnelle et la signature de refus ont été
séparées : seule la seconde inclut l’empreinte en mémoire afin de prouver le
rollback. Le passage complet final a ensuite réussi. Aucun essai n’a laissé de
base, rôle, conteneur ou ressource secrète de validation.

### Findings R4 réconciliés

1. Architecture/données a bloqué la première version R4 : ACL de types et
   propriété dans `public` non attestées, inventaire de propriété limité à
   quelques catalogues. L’attestation et le provisionneur utilisent désormais
   `pg_shdepend` pour toute propriété de la base, inspectent et révoquent les ACL
   des types porteurs de privilèges, puis testent un objet `public` et une
   collation possédés par le runtime.
2. Sécurité/intégrité PostgreSQL a bloqué les options de redélégation, le default
   ACL tiers dans `public`, le scénario d’objets agrégé et l’absence de preuve
   avant/après refus. Quatre `WITH GRANT OPTION` sont maintenant isolés ; chaque
   droit externe, chaque default ACL et chaque propriété sont injectés dans un
   scénario distinct ; la signature complète doit rester byte-for-byte identique
   autour de chaque refus.
3. La seconde passe architecture a relevé que le rôle et son vérificateur de mot
   de passe étaient modifiés avant le refus. Le provisioning est désormais une
   transaction unique ; la signature exhaustive de refus inclut une empreinte
   mémoire non journalisée du vérificateur, distincte de la signature
   opérationnelle d’idempotence, et les refus prouvent aussi son rollback.
4. Gouvernance/reproductibilité a relevé la date de réconciliation et les anciens
   compteurs devenus caducs pendant la correction. Les huit documents portent le
   ledger final, distinguent l’échec de syntaxe nettoyé des deux passages complets
   et conservent R4 comme instantané local non publié.

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

### Contre-revues du correctif Infrastructure

1. Architecture/données : la première correction envisagée passait au runtime
   sans matérialiser le schéma sur un runner neuf. Le finding était fondé ; les
   migrations sont maintenant exécutées sous le propriétaire, puis les ACL sont
   reprovisionnées avant le démarrage runtime.
2. Sécurité/intégrité : le propriétaire devait rester refusé et la nouvelle
   remontée d’erreur ne devait exposer ni secret ni DSN. Le smoke exige le
   `RuntimeDatabaseBoundaryError`, ne relâche aucun contrôle et neutralise trois
   secrets ainsi que les URL PostgreSQL/Redis avant toute sortie.
3. Gouvernance/reproductibilité : le correctif reste limité au smoke causal et
   aux cinq documents S1.2-03A. Le banc isolé confirme live/ready `200/200`, les
   pannes Redis et PostgreSQL `live=200`/`ready=503`, puis les deux reprises à
   `ready=200`; ses conteneurs, volume et secrets jetables sont supprimés.

Après réconciliation, aucune de ces trois contre-revues ne conserve de finding
fondé ouvert.

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
- les schémas non système préexistants hors `public` ne sont jamais corrigés
  automatiquement : toute propriété ou ACL dangereuse fait échouer le
  provisioning jusqu’à une remédiation explicite par leur propriétaire ;
- l’instantané local prépublication du 2026-09-16 a été établi sans commit,
  push, PR, Ready, merge, tag, release ou déploiement ; la publication Draft
  ultérieurement autorisée ne vaut ni Ready, ni merge, ni démarrage de
  S1.2-03B ;
- le correctif Infrastructure R2 décrit ci-dessus conserve son instantané local
  historique, postérieur à R1 et antérieur à son commit ; sa publication et ses
  quatre workflows réussis sont consignés séparément sans réécrire cette preuve ;
- l’instantané local prépublication de la réconciliation R3 du 2026-09-17 a été
  établi avant tout commit, push, changement de PR, rerun, Ready ou merge R3 et
  n’affirmait aucun SHA ou Run ID R3 futur.
- l’instantané historique local prépublication R4 du 2026-09-18 est postérieur
  à la publication R3. À sa date de capture, la seule mutation GitHub effectuée
  était la correction historique R1 du corps de PR ; aucun fichier R4 n’était
  alors commité ou publié et aucun rerun, Ready ou merge R4 n’avait été effectué.
  S1.2-03B reste `Not started`.

## Publication R4 et correctif local R5

R4 est publié au commit `ebcd3fc02c15b0ee9cf679978ab197e9865a1737`,
parent direct `8f8c447b9badd3c8bd330982a1c0e7ef38e246cf`, arbre
`bfa5e59cdd82e2ef1c478ff66daa3ac2f92f0434`, avec 13 fichiers et
`+1507/-228`. Les workflows `pull_request` sur ce head exact concluent :

- Infrastructure `35402506742` : `completed/failure` ;
- Launcher Windows `35402506744` : `completed/success` ;
- Security `35402506756` : `completed/success` ;
- Quality Linux `35402506746` : `completed/success`.

Infrastructure échoue dans le job `compose`, étape « Build and verify API health
transitions ». Génération Prisma, build, migrations et provisioning réussissent.
Le propriétaire est ensuite correctement refusé par
`RuntimeDatabaseBoundaryError`, mais l’oracle du smoke exige aussi
`runtime_owns_database_object`, absent de l’erreur réelle.

La reproduction isolée PostgreSQL 18.4 montre simultanément le rôle courant
comme propriétaire dans `pg_database.datdba` et zéro dépendance de propriété
pour cette base dans `pg_shdepend`. Ce propriétaire est le superutilisateur
bootstrap, un rôle épinglé dont PostgreSQL omet les dépendances partagées. Le
code de violation est donc absent dans ce contexte sans que l’attestation soit
relâchée. Les tests R4 continuent de rejeter séparément un schéma, un objet
`public` et une collation réellement possédés par le rôle runtime.

Le correctif local R5 exige toujours l’erreur typée, la violation
`administrative_role_attribute` et les violations d’écriture
`database_or_schema_write_privilege` et `unexpected_table_privilege`. Les codes
supplémentaires, dont `unexpected_type_privilege` et
`unexpected_default_privilege`, restent acceptés mais ne remplacent aucune
preuve minimale. Six tests ciblés et un smoke réel après migrations sur une base
éphémère passent sans secret. Cet instantané prépublication du 2026-09-18
n’affirme aucun SHA ou Run ID R5 futur ; à cette date, la description de PR
demeurait inchangée et aucun commit, push, rerun, Ready ou merge R5 n’avait été
effectué.

## Publication R5 et instantané historique prépublication R6

R5 est publié au commit `afaa652b7446b78ae35fb0bf6f4944af5625cef6`,
parent direct `ebcd3fc02c15b0ee9cf679978ab197e9865a1737`, arbre
`19e365f5ed0b1e06abfbef7c909dac0f9867b66d`, avec 10 fichiers et
`+350/-105`. Les workflows `pull_request` sur ce head exact concluent :

- Infrastructure `35454834845` : `completed/success` ;
- Launcher Windows `35454834879` : `completed/success` ;
- Security `35454834839` : `completed/success` ;
- Quality Linux `35454834904` : `completed/success`.

La Draft PR #45 compte 6 commits, 31 fichiers et `+4299/-201`. Elle demeure
ouverte, Draft et non fusionnée.

La revue CTO post-R5 a relevé deux frontières encore incomplètes. Premièrement,
les ACL de paramètres PostgreSQL sont globales au cluster : un droit `SET` ou
`ALTER SYSTEM` effectif accordé directement au runtime ou à `PUBLIC` doit
bloquer l’API, y compris avec option de redélégation. Deuxièmement, l’exception
de `SELECT` par défaut sur les futures tables `public` ne peut être acceptée que
si `pg_default_acl.defaclrole` est le propriétaire explicite de la base ; une
ACL identique créée par un rôle tiers reste dangereuse.

Dans cet instantané historique, le correctif local R6 ajoute
`unexpected_parameter_privilege`, inclut les ACL
de paramètres dans les preuves `PUBLIC` et de redélégation, et contrôle le
propriétaire de chaque default ACL. Le provisionneur inspecte les ACL globales
avant toute mutation et refuse avec un diagnostic borné sans secret ; il ne
révoque ni ne réécrit ces ACL. Un default ACL tiers dangereux est également
refusé avant normalisation, à signature inchangée.

La validation réelle PostgreSQL 18.4 sur deux bases éphémères indépendantes
confirme, pour chaque base :

- 23 provisionnements réussis, dont la répétition convergente ;
- 16 états dangereux refusés par l’API et le provisionneur sans mutation ;
- les cinq cas de paramètres : `SET` et `ALTER SYSTEM` directs ou via `PUBLIC`,
  puis `SET ... WITH GRANT OPTION` ;
- le default ACL `SELECT` du propriétaire de base accepté, le même privilège
  du rôle tiers refusé sans mutation, puis une future table de ce tiers non
  lisible après remédiation explicite de cette ACL ;
- quatre réparations isolées de `WITH GRANT OPTION` dans le périmètre réparable ;
- Prisma 7.9.1, `SELECT 1` et lecture `Customer` réussis ;
- huit refus SQLSTATE `42501` : DDL, `TRUNCATE`, trigger, `SET ROLE`,
  `SET session_replication_role = replica`, `INSERT`, `UPDATE` et `DELETE`.

### Contrôles R6 exécutés

Les commandes suivantes ont terminé avec le code `0` sur l’état fonctionnel
R6 validé :

- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File apps/api/prisma/run-runtime-boundary-validation.ps1` ;
- `npm.cmd run lint --workspace @kora-plus/api` ;
- `npm.cmd run typecheck --workspace @kora-plus/api` ;
- `npm.cmd run test --workspace @kora-plus/api -- --verbose` : 7 suites et
  26 tests ;
- `npm.cmd run test:tooling` : 303/303 ;
- `npm.cmd run security:scan` : 355 fichiers, historique et 52 sources
  immuables ;
- Prettier ciblé, références Markdown relatives, recherche des secrets et
  `git diff --check`.

Le build API et la génération Prisma 7.9.1 sont exécutés par le validateur
PostgreSQL. Une première exécution a révélé une jointure manquante vers
`current_database_entry`; elle a échoué avant les scénarios et ses seules
ressources éphémères ont été supprimées. Après correction, l’exécution complète
ci-dessus est verte. La contre-revue ultérieure n’a changé que le libellé de la
preuve « future table après remédiation » et les documents ; elle n’a modifié
aucun chemin SQL ni aucune assertion. La longue validation PostgreSQL n’a donc
pas été rejouée ; `node --check`, Prettier, les références Markdown, le scanner
et `git diff --check` ont été rejoués sur l’état final. Les audits, signatures
et licences de l’instantané initial n’ont pas été rejoués : aucun manifeste,
lockfile, dépendance ou résolution ne change en R6.

Le périmètre de cet instantané historique comprend exactement ces 13 fichiers :

- `apps/api/README.md` ;
- `apps/api/prisma/validate-runtime-boundary.mjs` ;
- `apps/api/src/database/postgresql-runtime-boundary.spec.ts` ;
- `apps/api/src/database/postgresql-runtime-boundary.ts` ;
- `apps/api/src/database/prisma.service.ts` ;
- `docs/governance/DECISION_LOG.md` ;
- `docs/governance/SOURCE_OF_TRUTH.md` ;
- `docs/qa/REQUIREMENTS_TRACEABILITY_MATRIX.md` ;
- `docs/qa/SLICE_1_2_03A_POSTGRESQL_RUNTIME_BOUNDARY_REPORT.md` ;
- `docs/roadmap/MVP_EXECUTION_PLAN.md` ;
- `docs/security/THREAT_MODEL.md` ;
- `infra/README.md` ;
- `infra/postgres/provision-runtime.sh`.

Diff de l’instantané historique après formatage : **13 fichiers, +498/-97**.

Les deux bases, six rôles, le conteneur et les fichiers de secrets éphémères
ont été supprimés de façon ciblée. Les conteneurs KORA+ préexistants n’ont pas
été modifiés. Cet état est l’instantané historique local prépublication R6 du
2026-09-20 : aucun commit, push, changement de PR, rerun, Ready ou merge R6
n’avait été effectué et aucun SHA ou Run ID R6 futur n’y était affirmé.
S1.2-03B restait `Not started`.

## Publication R6 et instantané historique prépublication R7

R6 a été publié au commit
`80e8a397b19a98bd85f5ef6fcd2afe8ef4407ab0`, parent
`afaa652b7446b78ae35fb0bf6f4944af5625cef6`, arbre
`c7c0c733bd28bacce41206290590c6f9fc043f2a`, avec 13 fichiers et
`+498/-97`. Infrastructure `36125459701`, Launcher Windows `36125459563`,
Security `36125459520` et Quality Linux `36125459526` sont tous
`pull_request/completed/success` sur ce head exact. La PR #45 affiche
7 commits, 31 fichiers et `+4700/-201` ; elle reste ouverte, Draft,
`CLEAN/MERGEABLE` et non fusionnée.

La revue CTO finale du 2026-09-25 a bloqué le passage en Ready sur deux
findings : les large objects n’étaient pas inclus dans la frontière de droits,
et une nouvelle connexion pouvait hériter de
`session_replication_role=replica` depuis `pg_db_role_setting` sans exercer un
droit `SET`.

### Correctifs de l’instantané historique prépublication R7

L’instantané historique local prépublication R7 du 2026-09-25 ajoute :

- l’inventaire hors schéma de `pg_largeobject_metadata.lomowner/lomacl` ;
- le refus de toute propriété ou capacité effective `SELECT`/`UPDATE`, y compris
  via `PUBLIC` et avec grant option ;
- le traitement des default ACL PostgreSQL 18 `L` : normalisation bornée pour
  le propriétaire/migrateur et refus inchangé pour un propriétaire tiers ;
- l’exigence `current_setting('session_replication_role') = 'origin'` sur la
  connexion Prisma réelle ;
- l’inspection avant mutation des réglages persistants de portée base
  (`setrole=0`), rôle (`setdatabase=0`) et rôle/base ;
- les ACL de large objects et toutes les portées `pg_db_role_setting` dans la
  signature de refus, distincte de la signature opérationnelle d’idempotence.

La reprise byte-finale a ensuite démontré un finding supplémentaire : malgré
`lo_compat_privileges=off` et l’absence d’ACL sur les objets existants, le
runtime héritait encore de `PUBLIC EXECUTE` sur `lo_create`, `lo_from_bytea` et
`lo_put`; il pouvait créer, posséder et alimenter son propre large object. Le
byte-final retire donc au runtime et à `PUBLIC` l’exécution de toutes les
routines `pg_catalog` `lo_*`, `loread` et `lowrite`. L’attestation refuse tout
droit effectif résiduel et `lo_compat_privileges=on`.

Le provisionneur ne corrige pas silencieusement un large object existant ni un
réglage persistant dangereux. Il les refuse avant ses mutations avec un
diagnostic borné, sans secret. Seule la default ACL `L` du propriétaire de base
appartient au périmètre de normalisation déterministe. Une ACL tierce reste
intacte jusqu’à sa remédiation explicite.

### Preuve PostgreSQL réelle R7

Le validateur a créé deux bases PostgreSQL 18.4 indépendantes. Sur chacune, il
a isolé et diagnostiqué séparément :

- un large object possédé par le runtime ;
- `SELECT` direct, `UPDATE` direct, `UPDATE` via `PUBLIC` et `SELECT WITH GRANT
OPTION` ;
- une default ACL `L` dangereuse du propriétaire, normalisée, puis la création
  d’un nouveau large object inaccessible au runtime ;
- une default ACL `L` tierce, refusée à signature inchangée, puis remédiée
  explicitement avant la création d’un large object tiers inaccessible ;
- une ACL directe `lo_create` du runtime, refusée à signature inchangée ;
- une ACL directe `lo_create` d’un rôle tiers, préservée par le provisionneur ;
- les refus `42501` séparés de `lo_create`, `lo_from_bytea`, `lo_put` et
  `lo_open` après durcissement de `PUBLIC` ;
- `lo_compat_privileges=on` hérité par une nouvelle connexion, refusé avant
  mutation, puis `off` après remédiation explicite et nouvelle connexion ;
- `ALTER DATABASE ... SET session_replication_role=replica`, `ALTER ROLE
runtime SET ...` et `ALTER ROLE runtime IN DATABASE ... SET ...` ;
- l’héritage de chaque réglage par une nouvelle connexion runtime, le refus de
  l’attestation, la signature inchangée et le retour à `origin` sur une nouvelle
  connexion après remédiation explicite.

Résultats cumulés réels :

| Contrôle                                    | Résultat local de l’instantané R7                          |
| ------------------------------------------- | ---------------------------------------------------------- |
| Bases indépendantes                         | 2 PostgreSQL 18.4                                          |
| Provisionnements réussis                    | 72, soit 36 par base                                       |
| Refus d’états dangereux sans mutation       | 54, soit 27 par base                                       |
| Réparations de grant option                 | 8, soit 4 par base                                         |
| Normalisations de default ACL `L`           | 2, soit 1 par base                                         |
| ACL tierces de routine préservées           | 2, soit 1 par base                                         |
| Réglages persistants de réplication refusés | 6, soit les 3 portées sur chaque base                      |
| Réglages `lo_compat_privileges` refusés     | 2, soit 1 par base                                         |
| Refus SQLSTATE `42501`                      | 24, soit 12 opérations par base                            |
| Prisma                                      | 7.9.1, `SELECT 1` et lecture `Customer` réussis            |
| Démarrage API                               | propriétaire refusé ; runtime sain accepté sur les 2 bases |
| Nettoyage                                   | 2 bases, 6 rôles, conteneur et secrets éphémères supprimés |

### Validations R7 exécutées

- `npm ci` : installation reproductible ; sa sortie npm a indiqué 0
  vulnérabilité, sans constituer les deux audits supply-chain dédiés ;
- génération Prisma 7.9.1 : réussie ;
- build API requis par le validateur : réussi ;
- lint API : réussi ;
- typecheck API : réussi ;
- tests API : 7 suites, 27 tests réussis ;
- test unitaire ciblé de frontière : 5 tests réussis, inclus dans les 27 ;
- tests d’outillage : 303/303 réussis ;
- syntaxe Node du validateur : réussie ;
- syntaxe et exécution shell du provisionneur : prouvées par 72 passages
  réussis et 54 refus contrôlés dans le conteneur Alpine ;
- Prettier ciblé, scanner officiel, références Markdown, recherche de secrets,
  contrôle de périmètre et `git diff --check` : exécutés sur l’état final.

Le graphe de dépendances, les manifestes et les lockfiles ne changent pas. Les
deux audits supply-chain dédiés et le contrôle de licences antérieur n’ont donc
pas été rejoués. La sortie d’installation de `npm ci` à zéro vulnérabilité est
rapportée séparément et n’est pas présentée comme ces audits dédiés.

À la date de cet instantané historique prépublication, R7 reste local, non
commité et non publié. Aucun SHA ou Run ID R7 futur n’est affirmé ; aucun push,
rerun, changement de PR, Ready ou merge n’a été effectué. La PR #45 reste
Draft et S1.2-03B reste `Not started`.

## Publication R7 et instantané historique prépublication R8

R7 a été publié au commit
`3b4e9e2fdf6d2fd53c08ad48edc20e8328e2411e`, parent
`80e8a397b19a98bd85f5ef6fcd2afe8ef4407ab0`, arbre
`50d8cdea797ff50b6fb1cb784c6cefa8904a18d2`, message
`fix(security): attest PostgreSQL large objects and session defaults`, avec 13
fichiers et `+1158/-88`. Infrastructure `36167761862`, Launcher Windows
`36167761974`, Security `36167761909` et Quality Linux `36167761881` sont tous
`pull_request/completed/success` sur ce head exact. La PR #45 affiche alors 8
commits, 31 fichiers et `+5770/-201` ; elle reste ouverte, Draft,
`CLEAN/MERGEABLE` et non fusionnée.

### Findings et politique R8

L’instantané historique local prépublication R8 du 2026-09-26 ferme deux
findings post-R7 :

1. les ACL relationnelles et de colonnes des catalogues
   `pg_catalog.pg_largeobject` et `pg_largeobject_metadata` n’étaient pas dans
   l’attestation ;
2. un override propriétaire/migrateur sûr pouvait masquer, sur la connexion du
   provisionneur, un défaut cluster dangereux réellement hérité par une
   nouvelle connexion runtime.

La matrice de catalogue appliquée est :

| Catalogue                 | Autorisé                                                           | Refusé                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `pg_largeobject`          | aucun droit runtime de relation ou de colonne                      | `SELECT`, écritures, `TRUNCATE`, `REFERENCES`, `TRIGGER`, `MAINTAIN`, grant option, directement, via `PUBLIC` ou rôle effectivement hérité |
| `pg_largeobject_metadata` | `SELECT` système standard de `PUBLIC`, sans option de redélégation | écritures, `TRUNCATE`, `REFERENCES`, `TRIGGER`, `MAINTAIN`, droits de colonne d’écriture et toute grant option                             |

Les ACL brutes de `PUBLIC` et du runtime, les privilèges obtenus via un rôle
effectivement hérité et les grant options sont inclus dans la signature avant
et après. Chaque scénario prouve d’abord la persistance de son ACL brute avant
de créditer l’API ou le provisionneur d’un refus ; seules les affirmations de
grant effectif exigent ensuite une fonction `has_*` vraie. PostgreSQL 18.4
conserve deux ACL d’écriture par base que les fonctions `has_*` déclarent non
effectives. Elles sont rapportées séparément, mais restent refusées par l’API
et le provisionneur parce que l’ACL brute persiste. De même, tout `SELECT`
direct, de colonne ou `PUBLIC` ajouté aux métadonnées est refusé, même s’il est
redondant avec la visibilité relationnelle système standard.

Pour `session_replication_role` et `lo_compat_privileges`, le provisionneur
refuse désormais tout override propriétaire/migrateur aux portées rôle ou
rôle/base, même lorsque sa valeur visible est sûre. Cette règle conservative
est nécessaire parce qu’un tel override peut cacher un défaut cluster
contraire. La preuve lit la valeur dangereuse depuis une nouvelle connexion
runtime, constate le refus avant mutation et compare rôle, memberships, ACL,
paramètres et empreinte du credential. Le provisionneur ne supprime jamais
l’override : la remédiation explicite doit établir le défaut cluster sûr puis
retirer la portée masquante.

### Preuve PostgreSQL réelle R8

Le validateur PostgreSQL 18.4 a exécuté deux bases éphémères indépendantes. Sur
chaque base, douze scénarios de catalogue couvrent les droits directs,
`PUBLIC`, de colonne, avec redélégation et par rôle hérité. Les ACL brutes sont
prouvées présentes avant chaque refus : sept grants deviennent effectifs, deux
ACL restent non effectives et trois ACL `SELECT` de métadonnées sont redondantes
avec le droit système standard. L’attestation et le provisionneur rejettent les
douze états. Quatre scénarios supplémentaires combinent un défaut cluster
réplication/large-object dangereux avec un override propriétaire sûr, aux
portées rôle puis rôle/base. La valeur dangereuse est prouvée sur une nouvelle
connexion runtime avant le refus.

Résultats cumulés réels :

| Contrôle                                        | Résultat local de l’instantané R8                          |
| ----------------------------------------------- | ---------------------------------------------------------- |
| Bases indépendantes                             | 2 PostgreSQL 18.4                                          |
| Provisionnements réussis                        | 104, soit 52 par base                                      |
| Refus d’états dangereux sans mutation           | 86, soit 43 par base                                       |
| Réparations de grant option                     | 8, soit 4 par base                                         |
| Refus d’ACL brutes de catalogues                | 24, soit 12 par base                                       |
| Grants de catalogue devenus effectifs           | 14, soit 7 par base                                        |
| ACL de catalogue persistées mais non effectives | 4, soit 2 par base                                         |
| ACL `SELECT` de métadonnées redondantes         | 6, soit 3 par base                                         |
| Défauts globaux masqués refusés                 | 8, soit 4 par base                                         |
| Normalisations de default ACL `L`               | 2, soit 1 par base                                         |
| ACL tierces de routine préservées               | 2, soit 1 par base                                         |
| Refus SQLSTATE `42501`                          | 24, soit 12 opérations par base                            |
| Prisma                                          | 7.9.1, `SELECT 1` et lecture `Customer` réussis            |
| Démarrage API                                   | propriétaire refusé ; runtime sain accepté sur les 2 bases |
| Nettoyage                                       | 2 bases, 6 rôles, conteneur et secrets éphémères supprimés |

Les scénarios R7 de propriété runtime réelle, ACL/default ACL, routines large
object, `lo_compat_privileges`, réplication persistante et refus DDL,
`TRUNCATE`, triggers, `SET ROLE` et écritures métier restent inclus. Le
validateur a aussi exécuté la génération Prisma 7.9.1 et le build API avec
succès. Le graphe, les manifestes et les lockfiles sont inchangés ; les audits
et licences antérieurs ne sont donc pas rejoués et ne sont pas présentés comme
des validations R8.

Après gel du contenu technique, la génération Prisma 7.9.1, le lint, le
typecheck, le build, les sept suites et 27 tests API, le test ciblé de frontière
(5/5), les 303 tests d’outillage, les syntaxes Node et shell et le contrôle
Prettier ciblé réussissent. Le scanner officiel couvre 355 fichiers,
l’historique Git et 52 sources immuables sans finding. Les références Markdown,
la chronologie, les secrets, les caractères de contrôle, le périmètre et
`git diff --check` sont contrôlés sur le byte-final documentaire.

### Périmètre et état de l’instantané R8

R8 modifie les cinq artefacts techniques récupérés après interruption, les
deux README et les six documents vivants S1.2-03A autorisés, sans créer de
fichier. Il ne modifie ni manifeste, lockfile, workflow, schéma Prisma,
migration S1.2-02, OpenAPI, contrat généré ou client Web/Admin/Mobile. À la
date de cet instantané historique prépublication, R8 reste local, non indexé,
non commité et non publié. Aucun SHA ou Run ID R8 futur n’est affirmé ; aucune
nouvelle mutation GitHub, aucun push, rerun, Ready ou merge n’est effectué. La
PR #45 reste Draft et S1.2-03B reste `Not started`.
