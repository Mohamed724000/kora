# KORA+ Final — Source de vérité

Statut : **DOCUMENT OPÉRATIONNEL VIVANT — S1.2-02 ET S1.2-03A CLÔTURÉS ET
FUSIONNÉS — S1.2-03B-R4 FUSIONNÉ VIA PR #48 — INSTANTANÉ LOCAL
PRÉPUBLICATION R3 DU 2026-10-04 : R2 ÉTAIT LE DERNIER HEAD PUBLIÉ DANS LA
DRAFT PR #50 NON FUSIONNÉE, REVUE CTO TERMINALE BLOCK, R3 VALIDÉ LOCALEMENT
ET NON PUBLIÉ À CET INSTANT — APRÈS CET INSTANTANÉ, GIT/GITHUB FONT FOI —
FOURNISSEUR DE CLÉS DE PRODUCTION NON QUALIFIÉ — C2/C3 NOT STARTED**

Date d’effet : 2026-07-28
Dernière réconciliation documentaire : 2026-10-04

## Hiérarchie normative

1. [Cahier des charges V4](../source-material/originals/KORA_PLUS_Cahier_des_charges_V4.docx) :
   produit, métier et périmètre.
2. [ADR-001 à ADR-024 acceptés](../source-material/originals/KORA_PLUS_Specification_Resolution_Pack_V2/docs/adr/) :
   corrections ultérieures et décisions explicites compatibles avec le Cahier.
3. [Engineering Specification](../source-material/originals/KORA_PLUS_Engineering_Specification.docx)
   et [Addendum V1.1](../source-material/originals/KORA_PLUS_Engineering_Specification_Addendum_V1.1.docx) :
   architecture, API, données, sécurité et tests, corrigés par les ADR.
4. [UI/UX Design Specification V1](../source-material/originals/KORA_PLUS_UI_UX_Design_Specification_V1.docx) :
   écrans et parcours Flutter, corrigés par les ADR.
5. [Back-Office AdminLTE Specification V1.1](../source-material/originals/KORA_PLUS_Back_Office_UI_UX_AdminLTE_Integration_Specification_V1.1.docx) :
   administration Next.js, corrigée par les ADR.
6. [Specification Alignment Register](SPEC_ALIGNMENT_REGISTER.md) :
   index des conflits et résolutions.
7. [Benchmark Empire Afrique](../source-material/originals/Screen%20KORA+%20Benchmarket.docx) :
   preuve ergonomique uniquement, jamais source de marque, d’assets ou de
   composition propriétaire.

## Autorité d’exécution clean room

1. [CLEAN_ROOM_SCOPE.md](CLEAN_ROOM_SCOPE.md)
2. [MASTER_EXECUTION_BLUEPRINT.md](../roadmap/MASTER_EXECUTION_BLUEPRINT.md)
3. [AI_OPERATING_MODEL.md](AI_OPERATING_MODEL.md)
4. prompt du lot explicitement autorisé dans la session active

Un prompt n’est exécutable que lorsqu’il est explicitement autorisé par le
Product Owner dans la session active. Tout prompt terminé, remplacé, archivé ou
non autorisé est historique, même s’il contient des impératifs.

## Catégories de sources

- **Source normative** : définit le produit ou une exigence officielle.
- **Correction ADR** : tranche une ambiguïté ou corrige une source de rang
  inférieur sans réécrire le Cahier.
- **Document opérationnel vivant** : traduit les décisions dans l’état courant
  du repository et doit évoluer avec les preuves.
- **Benchmark** : informe l’ergonomie, sans droit de copie.
- **Archive historique** : conservée pour traçabilité, non exécutable.

Les ADR-001 à ADR-024 actifs restent dans le Resolution Pack immuable sous
`docs/source-material/originals/` et ne sont jamais recopiés ni modifiés. Les
décisions postérieures au pack sont créées sous [`docs/adr/`](../adr/), à
commencer par
[ADR-025](../adr/ADR-025-admin-auth-session-audit-contexts.md). Cette séparation
préserve l'immuabilité des sources tout en autorisant des décisions nouvelles,
datées et traçables.

Le contrat [OpenAPI](../api/openapi.yaml), le modèle cible
[Prisma](../../apps/api/prisma/schema.prisma) et les types générés sont les
contrats techniques canoniques présents. S1.2-03B étend uniquement OpenAPI et
les types ; Prisma et les migrations restent inchangés jusqu'à une autorisation
runtime distincte.
S1.2-02 matérialise le schéma Prisma par des migrations PostgreSQL versionnées et
des contraintes SQL ; il ne constitue toujours pas un runtime métier.

État courant vérifié le 2026-10-02 : la PR #48, titre
`feat(contracts): define S1.2-03B Admin security gate`, est fusionnée et fermée
au merge `c97992ca2c82bc4f22f9222ea98ed53714fede4c`, arbre
`c8a6d52e7dcfdd24b5b9d0caee14363fa8220869`. Les workflows `push/main`
Infrastructure `36991329968`, Launcher Windows `36991329948`, Security
`36991329957` et Quality Linux `36991330060`, tentative 1, sont tous
`completed/success` sur ce merge. Les instantanés Draft R0–R4 plus bas restent
historiques.

Le mandat runtime distinct S1.2-03C1 matérialise les douze opérations
auth/session, six modèles, la migration unique, les contraintes et ACL C1, les
pools lecteur/writer attestés et le client Redis dédié. La surface contractuelle
reste à 60 chemins, 67 opérations et 137 schémas. Les gates applicatifs,
PostgreSQL, Redis et contractuels passent localement. La chaîne dev-only
signalée par `GHSA-vfj7-8cjw-p6xm` est retirée par l'override strictement scoped
du seul import `fast-glob` de `@next/eslint-plugin-next@16.3.8` vers
`tinyglobby@0.2.17`. Les audits npm bruts complet et production passent à zéro
vulnérabilité. Cette substitution est qualifiée uniquement sans
`settings.next.rootDir` ; le gate permanent refuse toute future apparition de
cette propriété et impose une nouvelle qualification. Dans l'instantané local
prépublication du 2026-10-04, R2 était le dernier head publié au commit
`59972cc0614842627c8c17717605345eaae277c4`, parent
`efb14d1d075dac50ff081b6ef3c1cce516de01e0`, arbre
`a4e721cf14350655c9d7a94baae28a5f4edb298d`, dans la Draft PR #50 toujours
ouverte et non fusionnée. Les quatre workflows R2 ont réussi sur ce head exact :
Infrastructure `37160117048`, Launcher Windows `37160117009`, Security
`37160117045` et Quality Linux `37160117042`.

La revue CTO terminale du head R2 a conclu **BLOCK** sur six findings :
memberships PostgreSQL entrantes, statuts Auth, rejeu de confirmation,
attribution des échecs post-session, indisponibilité de résolution JWT et audit
des refus de révocation. R3 traite localement ces findings dans le périmètre
autorisé ; les gates causaux locaux concluent au succès sur le gel des 19
fichiers autorisés. Le wrapper C1 final réussit PostgreSQL A/B et 26/26 tests
réels ; les gates Infrastructure isolés, API, OpenAPI 60/67/137, Contracts,
tooling et scanner officiel réussissent. Les tentatives intermédiaires non
concluantes ne sont pas comptées comme PASS. Dans cet instantané daté, R3 était
non indexé, non commité et non publié. Après cet instantané, l'état réellement
observé dans Git et GitHub fait foi.
Le fournisseur KMS/JWT de production reste non qualifié ; C2 et C3 restent
`Not started`. L'architecture courante est décrite dans
[SLICE_1_2_03C1_ADMIN_AUTH_SESSION_RUNTIME.md](../architecture/SLICE_1_2_03C1_ADMIN_AUTH_SESSION_RUNTIME.md).

Le complément Infrastructure du 2026-10-03 a rendu les scripts génériques
isolables sans modifier leurs valeurs locales par défaut, puis a exécuté
`infra:verify` et `infra:verify-api` au code 0 sur des ressources jetables. Il
prouve la création depuis volumes vides, l'ordre migrations puis
provisionnement/reprovisionnement, la persistance et le reset ciblé, le refus
du propriétaire, l'acceptation runtime, les transitions de santé
PostgreSQL/Redis et l'absence de fuite de secrets. Les ressources jetables ont
été supprimées ; les ressources Docker préexistantes ont conservé leurs IDs,
volumes, réseau, images, états et ports.

## Règle de contradiction

Aucun contributeur ni agent ne choisit silencieusement entre deux instructions.

1. Enregistrer l’écart dans [SPEC_ALIGNMENT_REGISTER.md](SPEC_ALIGNMENT_REGISTER.md).
2. Décrire l’impact produit, sécurité, finance ou livraison.
3. Appliquer la hiérarchie normative.
4. Créer ou amender un ADR lorsque l’architecture ou le comportement change.
5. Mettre à jour la matrice de traçabilité et les contrats concernés.
6. Obtenir l’autorité requise avant exécution.

Une décision acceptée n’est jamais réécrite silencieusement. Les corrections
ultérieures conservent l’historique.

## Documents vivants

- [AGENTS.md](../../AGENTS.md)
- [SOURCE_OF_TRUTH.md](SOURCE_OF_TRUTH.md)
- [SPEC_ALIGNMENT_REGISTER.md](SPEC_ALIGNMENT_REGISTER.md)
- [DECISION_LOG.md](DECISION_LOG.md)
- [GIT_WORKFLOW.md](GIT_WORKFLOW.md)
- [OWNERSHIP_MATRIX.md](OWNERSHIP_MATRIX.md)
- [SOURCE_BASELINE_MANIFEST.sha256](SOURCE_BASELINE_MANIFEST.sha256)
- [MASTER_EXECUTION_BLUEPRINT.md](../roadmap/MASTER_EXECUTION_BLUEPRINT.md)
- [MVP_EXECUTION_PLAN.md](../roadmap/MVP_EXECUTION_PLAN.md)
- [REQUIREMENTS_TRACEABILITY_MATRIX.md](../qa/REQUIREMENTS_TRACEABILITY_MATRIX.md)
- [DEFINITION_OF_DONE.md](../qa/DEFINITION_OF_DONE.md)
- [THREAT_MODEL.md](../security/THREAT_MODEL.md)

Les contrats OpenAPI et Prisma présents, ainsi que les types clients générés,
évoluent uniquement dans les lots qui les autorisent. Ils ne doivent jamais
contredire un ADR accepté. S1.1 est fusionné au merge
`bcb579916c1ca73e3cfb186683cb932f4f3905e9`. S1.2-01 complète la préparation
contractuelle et du modèle cible. S1.2-02, démarré depuis le merge S1.2-01
`dfb6445cb157b03142b7f1b01952fa76fdef16f9`, a matérialisé les 33 modèles et les
invariants SQL documentés, sans endpoint, service ou worker métier. Sa preuve
locale prépublication est datée du 2026-09-15 et demeure une preuve historique.

Après cet instantané, l’unique commit S1.2-02 publié
`2022f5a229c8cb5138205f5fb02d37ea344ef73b`, portant 14 fichiers, a été préservé
par la PR #43, fusionnée et fermée dans `main`. Le merge
`4a1f4306871cac661fa12d4f326495fc43cddbb4`, d’arbre
`95a9036ec5e287b78cdd2771010509d24292fa29`, possède dans l’ordre les parents
`dfb6445cb157b03142b7f1b01952fa76fdef16f9` et
`2022f5a229c8cb5138205f5fb02d37ea344ef73b`. Les workflows post-fusion
`push/main` Infrastructure `34986168463`, Launcher Windows `34986168571`,
Security `34986168621` et Quality Linux `34986168424` ont tous conclu
`completed/success`. Aucun tag, release ou déploiement n’a été créé et cette
fusion n’ajoute aucun endpoint, service, worker, seed, runtime métier ou
interface. S1.2-03 reste **Not started** ; son analyse demeure une proposition
soumise à une décision séparée et S1.2-03A n’est ni autorisé ni démarré.

Cette dernière phrase décrit l’état historique de la clôture S1.2-02. La PR #44
a ensuite été fusionnée et fermée au merge `main`
`95bdfcf30a14e05ae90b09150cf289e1e0343c0d`. Les workflows `push/main`
Infrastructure `35082285457`, Launcher Windows `35082285515`, Security
`35082285620` et Quality Linux `35082285461` ont tous conclu
`completed/success` sur ce merge.

Sur autorisation Product Owner distincte du 2026-09-16, S1.2-03A est démarré
depuis ce merge dans une branche et un worktree dédiés. L’état observé dans
l’instantané prépublication R5 du 2026-09-18 est **Draft PR #45 ouverte ; R4
publié ; Infrastructure R4 en échec ; trois autres workflows R4 réussis ;
correctif R5 validé localement ; non fusionné**.

Dans toute la chronologie R0 à R9 ci-dessous, les mentions `Draft`, ouverte ou
non fusionnée décrivent exclusivement l’instantané historique du head nommé ;
elles ne décrivent pas l’état courant après la clôture post-fusion.

L’instantané local prépublication du 2026-09-16 a été établi alors que les 26
fichiers étaient non indexés, non commités et non publiés ; cette formulation
reste une preuve historique datée. Le lot sépare le compte
propriétaire/migrateur PostgreSQL du rôle API de lecture, connecte Prisma 7.9.1
par `@prisma/adapter-pg` 7.9.1 et refuse le démarrage si le compte API possède
un attribut, une propriété, une appartenance ou un privilège inattendu, y
compris via `PUBLIC`. Il n’ajoute aucun endpoint, service métier, worker, seed,
écran, paiement, média, tag, release ou déploiement. Les capacités métier de
S1.2-03 au-delà de cette frontière technique restent **Not started** et
requièrent une autorisation séparée.

Le commit publié `974d7afa9d4dc9ceb88a35bd5bd7ae3f477cb875` était le head
initial de la Draft PR #45 avant R1. Ses premiers workflows `pull_request` ont
conclu Security `35119052015` en succès et Infrastructure `35119052104`,
Launcher Windows `35119052049` et Quality Linux `35119052101` en échec : après
`npm ci`, le client Prisma n’était pas généré avant build, typecheck ou tests.
Ces échecs R0 sont historiques.
La correction R1 ajoute aux seules commandes API les hooks de génération
Prisma et un test de contrat ; elle ne change ni dépendance, ni lockfile, ni
workflow, ni schéma, migration, OpenAPI ou frontière PostgreSQL. Aucun des runs
initiaux n’est relancé ; R1 produit des workflows distincts sur son propre head.

Le commit R1 publié `41b3d8f33a637108814208258a3e99b105be1afc` était le head
de la Draft PR #45 avant R2. Launcher Windows `35155026009`, Security
`35155025993` et Quality Linux `35155026016` ont conclu `completed/success` ;
Infrastructure `35155026285` a conclu `completed/failure`. Cet échec R1 est une
preuve historique : le smoke test provisionnait bien le rôle runtime, mais
lançait l’API avec le propriétaire/migrateur. Le garde a donc refusé ce compte
par `RuntimeDatabaseBoundaryError`, puis le script a masqué cette sortie sous un
timeout de 30 secondes. Dans l’instantané local antérieur à son commit, le
correctif R2 déploie les migrations sous le propriétaire, reprovisionne les ACL,
vérifie explicitement son refus, lance ensuite l’API avec le rôle runtime et
remonte immédiatement toute sortie fatale après neutralisation des secrets.
Aucun contrôle de privilèges n’est relâché et aucun droit propriétaire n’est
accordé au runtime. Cette preuve locale R2, antérieure au commit, demeure un
instantané historique du 2026-09-16 et ne préjugeait pas alors du résultat des
workflows R2.

R2 a ensuite été publié au commit
`9d163cc34caa57cd671b6783048d89dde6d18069`. Les workflows `pull_request`
Infrastructure `35162113781`, Launcher Windows `35162113686`, Security
`35162113920` et Quality Linux `35162113691` ont tous conclu
`completed/success` sur ce head exact. La PR #45 reste ouverte, Draft, non
fusionnée et sans passage en Ready. S1.2-03B reste **Not started**.

L’instantané local prépublication R3 daté du 2026-09-17 a été établi alors
qu’aucun commit, push, changement de PR, rerun, Ready ou merge R3 n’avait été
effectué ; aucun SHA ou Run ID R3 futur n’y était affirmé.

R3 a ensuite été publié au commit
`8f8c447b9badd3c8bd330982a1c0e7ef38e246cf`. Les workflows `pull_request`
Infrastructure `35209186465`, Launcher Windows `35209186447`, Security
`35209186482` et Quality Linux `35209186464` ont tous conclu
`completed/success` sur ce head exact.

La revue CTO post-R3 a bloqué la fusion sur deux constats : le compteur
historique R1 du corps de PR et l’inspection PostgreSQL limitée à `public`.
L’unique correction GitHub autorisée le 2026-09-18 a remplacé le compteur R1
`+116/-42` par sa valeur Git/GitHub `+118/-42`, sans changer le cumul R3
`4 commits, 28 fichiers, +2761/-187`, le titre, le head, la base ou le statut
Draft. Le correctif local R4 étend l’attestation à tous les schémas non système
de la base courante, aux types, aux options de redélégation et à toute propriété
enregistrée dans la base. Il refuse sans les réécrire les ACL ou propriétés
tierces hors profil. Les deux bases éphémères ont chacune validé le témoin sain,
18 provisionnements réussis, 11 refus déterministes avec signature inchangée,
quatre réparations isolées de `WITH GRANT OPTION`, Prisma, sept refus `42501` et
le nettoyage ciblé. Cet état R4 constitue l’instantané historique local
prépublication daté du 2026-09-18 : au moment de sa capture, aucun commit, push,
rerun, Ready ou merge R4 n’avait été effectué. S1.2-03B reste **Not started**.

R4 a ensuite été publié au commit
`ebcd3fc02c15b0ee9cf679978ab197e9865a1737`, parent direct
`8f8c447b9badd3c8bd330982a1c0e7ef38e246cf`, avec 13 fichiers et
`+1507/-228`. Launcher Windows `35402506744`, Security `35402506756` et
Quality Linux `35402506746` ont conclu `completed/success` ; Infrastructure
`35402506742` a conclu `completed/failure`. Le garde refusait correctement le
propriétaire, mais le smoke exigeait en plus `runtime_owns_database_object`.
PostgreSQL confirme que le propriétaire initial est `pg_database.datdba` sans
ligne de propriété correspondante dans `pg_shdepend` ; ce code n’est donc pas
une preuve minimale exigible dans ce scénario.

L’instantané local R5 du 2026-09-18 conserve l’erreur typée, l’attribut
administratif et les violations d’écriture comme preuves obligatoires, tout en
acceptant les violations supplémentaires. Il ne modifie ni le garde API, ni le
provisionneur, ni le schéma, les migrations, OpenAPI, les contrats, workflows,
lockfiles ou clients. Au moment de cet instantané, aucun commit, push, rerun ou
changement de PR R5 n’avait été effectué et S1.2-03B restait **Not started**.

R5 a ensuite été publié au commit
`afaa652b7446b78ae35fb0bf6f4944af5625cef6`, parent direct
`ebcd3fc02c15b0ee9cf679978ab197e9865a1737`, arbre
`19e365f5ed0b1e06abfbef7c909dac0f9867b66d`, avec 10 fichiers et
`+350/-105`. Infrastructure `35454834845`, Launcher Windows `35454834879`,
Security `35454834839` et Quality Linux `35454834904` ont tous conclu
`pull_request/completed/success` sur ce head exact. La Draft PR #45 compte alors
6 commits, 31 fichiers et `+4299/-201` ; elle reste ouverte, Draft et non
fusionnée.

L’instantané historique local prépublication R6 du 2026-09-20 corrige deux constats CTO
sans prétendre à une publication future. L’attestation bloque désormais tout
droit PostgreSQL `SET` ou `ALTER SYSTEM` effectif accordé au runtime ou à
`PUBLIC`, avec ou sans option de redélégation. Le provisionneur contrôle ces ACL
globales avant toute mutation et refuse sans les normaliser. L’exception de
`SELECT` par défaut sur les futures tables `public` est limitée au propriétaire
explicite de la base ; la même ACL créée par un rôle tiers est refusée sans
mutation, puis sa future table est non lisible après remédiation explicite de
cette ACL. Deux bases éphémères ont
chacune validé 23 provisionnements réussis, 16 refus déterministes à signature
inchangée, quatre réparations de redélégation, Prisma, `SELECT 1`, lecture
`Customer` et huit refus `42501`. À la date de cet instantané, R6 n’était ni
commité ni publié, aucun SHA ou Run ID R6 futur n’y était affirmé, la PR #45
restait Draft et S1.2-03B restait **Not started**.

R6 a ensuite été publié au commit
`80e8a397b19a98bd85f5ef6fcd2afe8ef4407ab0`, parent direct
`afaa652b7446b78ae35fb0bf6f4944af5625cef6`, arbre
`c7c0c733bd28bacce41206290590c6f9fc043f2a`, avec 13 fichiers et
`+498/-97`. Infrastructure `36125459701`, Launcher Windows `36125459563`,
Security `36125459520` et Quality Linux `36125459526` ont tous conclu
`pull_request/completed/success` sur ce head exact. La PR #45 compte alors
7 commits, 31 fichiers et `+4700/-201` ; elle reste ouverte, Draft, proprement
fusionnable et non fusionnée.

La revue CTO finale en lecture seule du 2026-09-25 a ensuite bloqué le passage
en Ready sur deux lacunes PostgreSQL : les ACL courantes et par défaut des
large objects PostgreSQL 18, qui sont hors schéma, et une valeur persistante
`session_replication_role=replica` héritée par une nouvelle connexion sans
exécuter `SET`.

L’instantané historique local prépublication R7 du 2026-09-25 ferme ces deux
lacunes et le finding fondé découvert lors de la reprise byte-finale, sans
modifier le schéma Prisma, les migrations, OpenAPI, les contrats,
les workflows, les manifestes, les lockfiles ou les clients. L’attestation API
refuse la propriété et tout droit effectif `SELECT`/`UPDATE` sur un large
object, y compris via `PUBLIC` ou avec redélégation, et exige
zéro droit d’exécution effectif sur les routines `pg_catalog` `lo_*`, `loread`
et `lowrite`, ainsi que `lo_compat_privileges=off`. Elle exige aussi
`current_setting('session_replication_role') = 'origin'` sur la connexion
runtime réelle. Le provisionneur normalise seulement les default ACL `L` du
propriétaire/migrateur et retire l’exécution des routines large-object à
`PUBLIC` et au runtime. Un large object dangereux, une ACL directe de routine
du runtime, une default ACL `L` tierce ou un réglage persistant dangereux est
refusé avant mutation avec signature inchangée ; les ACL directes de rôles
tiers sur ces routines restent intactes.

Deux bases PostgreSQL 18.4 indépendantes valident chacune 36 provisionnements
réussis, 27 refus déterministes sans mutation, quatre réparations de
redélégation, une normalisation de default ACL de large objects, trois refus
de réglages persistants de réplication, un refus de
`lo_compat_privileges=on`, une ACL tierce de routine préservée et douze refus
`42501`. Prisma
7.9.1, `SELECT 1`, la lecture `Customer`, le démarrage runtime et le refus du
propriétaire restent validés. À la date de cet instantané, R7 demeure local,
non commité et non publié ; aucun SHA ou Run ID R7 futur n’est affirmé, la PR
#45 reste Draft et S1.2-03B reste **Not started**.

R7 a ensuite été publié au commit
`3b4e9e2fdf6d2fd53c08ad48edc20e8328e2411e`, parent direct
`80e8a397b19a98bd85f5ef6fcd2afe8ef4407ab0`, arbre
`50d8cdea797ff50b6fb1cb784c6cefa8904a18d2`, avec 13 fichiers et
`+1158/-88`. Infrastructure `36167761862`, Launcher Windows `36167761974`,
Security `36167761909` et Quality Linux `36167761881` ont tous conclu
`pull_request/completed/success` sur ce head exact. La Draft PR #45 compte
alors 8 commits, 31 fichiers et `+5770/-201` ; elle reste ouverte, Draft,
`CLEAN/MERGEABLE` et non fusionnée.

L’instantané historique local prépublication R8 du 2026-09-26 ferme deux
angles morts supplémentaires sans modifier manifeste, lockfile, workflow,
schéma Prisma, migration, OpenAPI, contrat ou client. L’attestation et le
provisionneur contrôlent désormais les ACL relationnelles et de colonnes de
`pg_catalog.pg_largeobject` et `pg_largeobject_metadata`, directement, via
`PUBLIC` et via un rôle effectivement hérité, avec leurs grant options. Le
`SELECT` système standard non redélégable de `PUBLIC` sur
`pg_largeobject_metadata` reste admis ; tout autre droit sur ces catalogues est
refusé selon la matrice explicite testée.

Le provisionneur refuse aussi, avant toute mutation, tout override
propriétaire/migrateur de `session_replication_role` ou
`lo_compat_privileges`, même sûr, lorsqu’il peut masquer un défaut cluster
inconnu à cette connexion. Cette limite est volontairement conservative : la
remédiation doit établir un défaut global sûr et retirer l’override, jamais
normaliser silencieusement l’état masquant. Deux bases PostgreSQL 18.4
indépendantes valident au total 104 provisionnements réussis, 86 refus à
signature inchangée et 24 ACL de catalogue brutes refusées par l’API et le
provisionneur : 14 grants effectifs, quatre ACL non effectives mais persistées
et six ACL `SELECT` de métadonnées redondantes avec la visibilité standard de
`PUBLIC`. Huit défauts globaux masqués sont refusés et 24 opérations rendent
`42501`. Prisma
7.9.1, `SELECT 1`, la lecture `Customer`, le démarrage runtime et le refus du
propriétaire restent validés. À la date de cet instantané, R8 est local, non
indexé, non commité et non publié ; aucun SHA ou Run ID R8 futur n’est affirmé,
la PR #45 reste Draft et S1.2-03B reste **Not started**.

R8 a ensuite été publié au commit
`82d1655f3f6700f4bbfac76413e2b0de0757b7a9`, parent direct
`3b4e9e2fdf6d2fd53c08ad48edc20e8328e2411e`, arbre
`8e1e648feb20e092ba50c2783611232a96407051`, message
`fix(security): attest PostgreSQL catalog ACLs and masked settings`, avec 13
fichiers et `+1374/-68`. Infrastructure `36260566060`, Launcher Windows
`36260566119`, Security `36260566203` et Quality Linux `36260566159` ont tous
conclu `pull_request/completed/success` sur ce head exact. Le cumul observé
après R8 est de 9 commits, 31 fichiers et `+7076/-201` ; la PR #45 reste
ouverte, Draft, `CLEAN/MERGEABLE` et non fusionnée.

La revue CTO finale post-R8 conclut **GO** sur les axes architecture/données et
sécurité/intégrité PostgreSQL. Le workflow Security R8 a exécuté les audits npm
complet et production à zéro vulnérabilité ainsi que l’inventaire de licences :
1 141 paquets installés, aucun non déclaré et aucun non approuvé.

Au head R8, la baseline technique S1.2-03A publiée était R8 et la PR demeurait
Draft et non fusionnée. Le commit documentaire R9
`fc3c3e75f4b7eed3f879bd47fc7fdd2765eb1e66`, parent direct de R8, a ensuite
réconcilié les preuves de publication sans modifier cette baseline technique.
Les workflows `pull_request` R9 Infrastructure `36277785889`, Launcher Windows
`36277785803`, Security `36277785832` et Quality Linux `36277785782` ont tous
conclu `completed/success` sur ce head exact.

La PR #45 est désormais fusionnée et fermée dans `main` au merge
`8e2e9252a0ac6faa1a7aa44e08e82e07317f4d86`, arbre
`d1ccbc5587f136baf2247a4055544477ec344555`, avec les parents ordonnés
`95bdfcf30a14e05ae90b09150cf289e1e0343c0d` puis
`fc3c3e75f4b7eed3f879bd47fc7fdd2765eb1e66`. Ses 10 commits et 31 fichiers
sont préservés. Les workflows post-fusion `push/main` Infrastructure
`36278873811`, Launcher Windows `36278873882`, Security `36278873863` et
Quality Linux `36278873968` ont tous conclu `completed/success` sur ce merge
exact. Aucun tag, release ou déploiement n’accompagne cette clôture ; la branche
et le worktree S1.2-03A sont préservés.

S1.2-03A est entièrement clôturé. Cette clôture n’ajoute aucun endpoint,
service métier, worker, seed, interface, média ou paiement et n’élargit pas le
rôle runtime de lecture. À cette clôture historique, S1.2-03B restait **Not
started** et requérait une autorisation CTO séparée. La présente réconciliation documentaire consigne les
preuves post-fusion. Son état de publication est vérifiable dans GitHub et ne
modifie pas la baseline technique S1.2-03A.

## État contractuel S1.2-03B

Dans l’instantané historique prépublication du 2026-09-29, S1.2-03B est une
décision contractuelle locale : 60 chemins et 67 opérations
OpenAPI sont verrouillés, dont 27 opérations Admin Security réparties entre
S1.2-03C1 et S1.2-03C2. ADR-025 et le rapport de gate en sont les preuves
vivantes. Aucun runtime, schéma Prisma, migration ou interface n'est déclaré
commencé. À la date de cet instantané, toute publication Git et toute ouverture
de S1.2-03C exigeaient une décision CTO distincte.

Le contrat rétablit les filtres et la preuve ADR-004/019, distingue
`AdminSecurityEvent` avant contexte prouvé de l'`AuditLog` transactionnel, et
génère l'XOR strict `ADMIN_SESSION | ADMIN_RECOVERY | SYSTEM`. Les migrations et
contraintes nécessaires sont des prérequis des runtimes C1/C2 ; C3 reste
exclusivement l'interface d'authentification Admin et demeure `Not started`.

## Instantané historique local prépublication S1.2-03B-R1

Qualification : état observé le 2026-09-29 avant le commit et le push R1.

R0 est publié au commit
`a1002b37b26feb456e2b11df87c20e671c4c20ae`. La PR #48 demeure ouverte,
Draft, non fusionnée et sa description reste « CI en attente ». Les workflows
R0 Infrastructure `36572630270`, Launcher Windows `36572630257` et Quality
Linux `36572630225` ont réussi. Security R0 `36572630278` a explicitement
signalé `GHSA-qw65-cvwx-89v3`, `GHSA-58mr-gqgx-xq4g` et
`GHSA-3pph-fpjx-jg34`. Le diagnostic R1 a ensuite confirmé que le graphe R0
était également affecté par `GHSA-hrr3-gc8f-f4qj`.

R1 remédie localement ces quatre avis par les overrides parentés exacts
`ajv@8.18.0 > fast-uri@3.1.8` et
`@nestjs/platform-express@11.1.28 > multer@2.4.0`. Le scanner refuse
explicitement `fast-uri` 3.x `>=3.0.0 <3.1.8` et Multer 2.x
`>=2.2.0 <2.4.0`. Le retrait de `concat-stream` et `typedarray` est la
conséquence du remplacement de l’ancien chemin Multer.

Deux installations reproductibles conservent le même lockfile et le même
graphe. Les sept artefacts signalés textuellement `extraneous` sont des nœuds
optionnels de branches WASM/plateforme déjà verrouillées dans R0 ; ils ne sont
ni nouveaux ni modifiés par R1, `npm ls` retourne 0 et ne signale aucun paquet
`invalid` ni peer cassée. Audits, signatures et licences restent conformes.

Le contrat reste strictement identique à R0 : 60 chemins, 67 opérations et
137 schémas. Aucun endpoint multipart, runtime Admin, schéma Prisma,
migration, workflow, interface ou capacité produit n’est ajouté. R1 demeure
local, non indexé, non commité et non publié, sans SHA, arbre ou Run ID futur.
Toute publication exige une décision CTO distincte.

## État historique postpublication R1 et réconciliation documentaire R2

R1 est publié au commit
`3c1e0a067c1c977dcc7a85e4baa892ebdcc0b82e`, parent
`a1002b37b26feb456e2b11df87c20e671c4c20ae`, arbre
`c87ca8400af2e421931533e2e6b6853680360800`, message
`fix(security): remediate S1.2-03B supply-chain findings`. Le commit porte
exactement 10 fichiers et `+358/-78`; son empreinte agrégée est
`8298eb4de428fa578ed34af3f5ce0f5d80979ea02f124f78a3f8a603d3bbf659`.

Infrastructure `36642550943`, Launcher Windows `36642550958`, Security
`36642550938` et Quality Linux `36642551010` sont tous
`pull_request/completed/success` sur ce head exact. Les preuves CI R1 sont les
audits complet/production à zéro vulnérabilité, les licences 1 139/0/0, le
scanner sur 358 fichiers avec historique actif et 52 sources immuables, le
lockfile déterministe et les quatre workflows verts. `npm audit signatures`
n’est pas déclaré exécuté dans GitHub Actions.

Les preuves locales R1 restent séparées : 1 130 signatures de registre, 198
attestations sans invalide, licences 1 132/0/0, deux installations
reproductibles, sept artefacts WASM optionnels qualifiés et validations locales
API, Flutter et Infrastructure.

Au head R1, la PR #48 demeurait `OPEN`, Draft, mergeable et non fusionnée, avec
2 commits, 20 fichiers et `+8291/-1220`. Le contrat S1.2-03B était publié mais
pas fusionné ; sa surface restait de 60 chemins, 67 opérations et 137 schémas.
Aucun runtime, schéma Prisma, migration ou interface n’était commencé, et
S1.2-03C1/C2/C3 restaient `Not started`.

R2 modifie uniquement les six documents autorisés et aucun octet technique.
Son état de publication fait foi dans Git et GitHub ; aucun SHA ni Run ID R2
futur n’est anticipé dans ce document.

## Instantané historique local prépublication S1.2-03B-R3 — 2026-10-01

R2 est désormais publié au commit documentaire
`6bc344c4eca7065089a6f6af6a9d47a98bf76b0f`, parent R1
`3c1e0a067c1c977dcc7a85e4baa892ebdcc0b82e`, arbre
`55a00c1c03d5e5142f81c0f99398d0686ec1a04b`. Son diff contient exactement
six documents, `+271/-74`, avec l'empreinte agrégée
`431100164b601a9b5b95586160c6e42591ce353b9d9d1d641145e1a987bc3e87`.
La PR #48 reste `OPEN`, Draft et non fusionnée, avec 3 commits, 20 fichiers et
`+8488/-1220`.

Les workflows R2 Infrastructure `36707322816`, Quality Linux `36707322868` et
Launcher Windows `36707322988` ont réussi. Security `36707322818` a échoué au
code 1 à `Audit dependency trees` sur
`minimatch@10.2.6 > brace-expansion@5.0.9`. La cause est l'apparition dans la
réponse d'audit des avis `GHSA-q2hr-2g5m-vwhr`,
`GHSA-qhr7-859c-m2p7` et `GHSA-6j4f-fj2g-mc7p`, non les six octets
documentaires R2. Les étapes ultérieures du workflow n'ont pas été exécutées.

R3 impose localement `brace-expansion@5.0.12`, `next@16.3.8` et
`eslint-config-next@16.3.8`. La mise à niveau Next est une qualification
distincte apparue après R2 : elle couvre `GHSA-vcvr-r3jv-pc5j` ainsi que les
sept avis publiés avec la release 16.3.8. Le lockfile npm ne gagne ni ne perd de
nœud, modifie exactement 13 versions causales et reste byte-identique après
deux installations propres. Audits complet et production, signatures,
attestations, licences, scanner, outillage, format, lint, typecheck, tests et
builds applicables sont conformes localement.

La source contractuelle reste byte-identique : OpenAPI 60 chemins, 67
opérations et 137 schémas ; génération TypeScript SHA-256
`ef40a5ec43aa3deb63a64ca980436f2a9cb40e2cd108106a9ca5f2f21f92bac0`.
R3 ne modifiait aucun runtime, schéma Prisma, migration, workflow, contrat ou
interface. À la date de cet instantané, il était local, non indexé, non commité
et non publié. La PR #48 restait Draft et S1.2-03C1/C2/C3 restaient
`Not started`. Après cet instantané, l'état de publication fait foi dans Git et
GitHub sans qu'aucun SHA ou Run ID futur soit anticipé ici.

## Baseline publiée S1.2-03B-R3 et instantané historique local prépublication R4 — 2026-10-01

R3 est publié au commit
`1a6c4efeb169e89ccf989004559f4e0c1af80af3`, parent direct R2
`6bc344c4eca7065089a6f6af6a9d47a98bf76b0f`, arbre
`031101296c44d18d7f1a2ab1f917ac1432023f6d`, avec 13 fichiers et
`+893/-117`. Infrastructure `36894241121`, Launcher Windows `36894240862`,
Security `36894240870` et Quality Linux `36894241013`, tentative 1, sont tous
`pull_request/completed/success` sur ce head exact.

Avant la publication R4, la PR #48 était `OPEN`, Draft, `CLEAN` et non
fusionnée. Son cumul publié était de 4 commits, 23 fichiers et `+9342/-1298` ;
le SHA-256 de son corps était
`b103546d26756e2a61378a6738a50ef3e23a562a23eac303b910966271fcb97b`.
Les preuves locales R3 historiques restent distinctes de ces preuves CI : elles
conservent notamment les deux essais réseau de signatures `NON CONCLUSIVE`, le
troisième essai réussi, l'interruption initiale liée au lock du cache Flutter
puis la relance 22/22, et la limite iOS non exécutée sous Windows.

La revue CTO post-R3 a retenu deux findings : le champ `signatureInput` décrivait
seulement le payload canonique et non le signing input RFC 7515, tandis que des
blocs R1/R2 historiques restaient libellés comme courants. Dans l'instantané
prépublication, R4 corrigeait le contrat en distinguant le payload JCS UTF-8, l'ASCII de
`BASE64URL(protected).BASE64URL(payload)` sans padding et la sérialisation
détachée `protected..signature`; le profil `b64=false` est interdit. Les blocs
R1/R2 conservent tous leurs chiffres mais sont désormais qualifiés
d'historiques.

R4 constitue ici un instantané local prépublication daté du 2026-10-01. Il ne
modifiait aucun manifeste, lockfile, dépendance, workflow, runtime, schéma
Prisma, migration, provisioning ou interface ; aucun SHA, arbre, Run ID ou
succès CI R4 futur n'y était affirmé. La PR #48 était Draft et S1.2-03C1/C2/C3
restaient `Not started`. Après cet instantané, l'état de publication et de CI
fait foi dans Git et GitHub.

La validation locale ciblée conserve la surface 60/67/137, produit le contrat
généré byte-identique d'empreinte SHA-256
`b3a62e0522d9ca0b8df582f0b9c23e712f0af4953941eadbd500f477f4396c3a`,
et conclut avec 274/274 tests OpenAPI+Contracts et 367/367 tests tooling. Les
contrôles Contracts, Prettier ciblé, références, chronologie, encodage, scanner
officiel avec historique, allowlist et `git diff --check` passent. Les audits
npm complet et production frais terminent au code 0 avec zéro vulnérabilité.
Les signatures, licences, builds applicatifs, Flutter et PostgreSQL ne sont pas
rejoués, leurs fichiers techniques étant inchangés par R4.
