# S1.2-03A — PostgreSQL Least-Privilege Runtime Boundary & Prisma Adapter

Date initiale : 2026-09-16
Dernière réconciliation : 2026-09-18
État : **DRAFT PR #45 OUVERTE — R4 PUBLIÉ — INFRASTRUCTURE R4 EN ÉCHEC — TROIS WORKFLOWS R4 RÉUSSIS — R5 VALIDÉ LOCALEMENT — NON FUSIONNÉ**

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
R2, R3 et R4 ne changent ni dépendance ni lockfile ; audits, signatures et
licences n’ont pas été rejoués après R0 et ne sont pas présentés comme des
résultats R4.

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
4. 18 exécutions réussies du provisionneur livré : les deux premières
   produisent une signature identique couvrant tous les schémas non système,
   ACL courantes/par défaut, options de redélégation, propriétés, attributs,
   memberships et paramètres de rôle ; la troisième répare une dérive de
   colonne dans `public`, onze passages confirment la convergence après
   réparation explicite des états refusés et quatre réparent isolément les
   options de redélégation ;
5. onze refus déterministes du provisionneur, avec diagnostic borné et signature
   inchangée : schéma possédé par le runtime, `PUBLIC CREATE`, objet `public`,
   collation, privilèges de table, colonne, séquence, routine et type, default ACL
   externe et default ACL d’un propriétaire tiers dans `public` ;
6. une connexion `pg`, `SELECT 1`, une lecture Prisma de `Customer` et le
   démarrage réel de l’API avec le rôle runtime ;
7. un essai de démarrage API avec le propriétaire, obligatoirement refusé.

Résultats identiques sur A et B : 34 tables lisibles, zéro violation de droits
table, colonne, vue, `MAINTAIN`, séquence, routine, type ou option de
redélégation, zéro membership, propriété ou droit `PUBLIC`. Un schéma tiers sain
reste inaccessible. Des tables, séquences, fonctions et types créés après
provisioning dans `public` et ce schéma confirment les ACL par défaut minimales.
Les onze états dangereux sont isolément refusés par le démarrage API et le
provisionneur sur A et B, sans mutation de leur signature.

| Opération runtime interdite | Résultat A | Résultat B |
| --------------------------- | ---------- | ---------- |
| `CREATE TABLE`              | `42501`    | `42501`    |
| `TRUNCATE`                  | `42501`    | `42501`    |
| désactivation de trigger    | `42501`    | `42501`    |
| `SET ROLE` propriétaire     | `42501`    | `42501`    |
| `INSERT` métier             | `42501`    | `42501`    |
| `UPDATE` métier             | `42501`    | `42501`    |
| `DELETE` métier             | `42501`    | `42501`    |

Après validation, seules les deux bases, les six rôles, le conteneur et les
deux fichiers secrets créés par l’essai sont supprimés. Le nettoyage tente
chaque cible même si une autre suppression échoue. Aucun volume nommé, réseau,
image ou ressource étrangère n’est supprimé.

## Validations

| Validation                         | Résultat courant                                                                         |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| Prisma Client 7.9.1 generate       | PASS                                                                                     |
| Prettier ciblé                     | PASS                                                                                     |
| Typecheck API après correction     | PASS — `pretypecheck` génère Prisma 7.9.1 avant `tsc`                                    |
| Tests applicatifs                  | PASS R4 — API 26/26 ; aucun autre workspace applicatif touché                            |
| Tests d’outillage                  | PASS R4 — 297/297, dont le contrat de génération Prisma en checkout propre               |
| Builds                             | PASS R4 — API construit par le validateur ; autres applications inchangées               |
| Compose rendu et absence de secret | PASS                                                                                     |
| Upgrade `infra:prepare` historique | PASS — valeurs préservées, clé runtime ajoutée une fois, second passage identique        |
| Validation réelle sur deux bases   | PASS R4 — 36 succès, 22 refus inchangés, 8 grant options réparées, 14 refus `42501`      |
| Audits npm complet et production   | PASS pré-correction — zéro vulnérabilité ; graphe inchangé, non rejoué ensuite           |
| Signatures et attestations npm     | PASS pré-correction — 1 132 signatures, 198 attestations ; non rejoué ensuite            |
| Licences npm                       | PASS pré-correction — 1 134 paquets, zéro écart ; graphe inchangé, non rejoué ensuite    |
| Scanner officiel                   | PASS — 353 fichiers, historique et 52 sources immuables contrôlés                        |
| Workflows et OpenAPI               | PASS — 4 workflows, 4 actions verrouillées ; 34 chemins, 87 schémas, 18 invariants       |
| Reproduction CI avant correction   | PASS — clone neuf, client absent ; TS2305 et trois TS2339 reproduits                     |
| Correction CI en clone neuf        | PASS — génération indépendante avant typecheck, build et API 26/26                       |
| Reproduction Infrastructure R1     | PASS — propriétaire transmis ; fatal `RuntimeDatabaseBoundaryError` neutralisé           |
| Correctif Infrastructure isolé     | PASS — migrations owner, refus owner, runtime live/ready, pannes et reprises 200/503/200 |
| Confidentialité du smoke corrigé   | PASS — aucun secret ni URL PostgreSQL/Redis dans les sorties capturées                   |
| Workflows R2 publiés               | PASS — quatre `pull_request/completed/success` sur `9d163cc…`                            |
| Workflows R3 publiés               | PASS — quatre `pull_request/completed/success` sur `8f8c447…`                            |

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
