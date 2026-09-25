# KORA+ Final — Source de vérité

Statut : **DOCUMENT OPÉRATIONNEL VIVANT — S1.2-02 CLÔTURÉ — S1.2-03A EN DRAFT PR #45 — R5 PUBLIÉ ET CI VERTE — PREUVE PRÉPUBLICATION R6 VALIDÉE — NON FUSIONNÉ**

Date d’effet : 2026-07-28
Dernière réconciliation documentaire : 2026-09-20

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

Les 24 ADR actifs se trouvent actuellement dans le Resolution Pack immuable.
Aucun ADR-025 n’est créé par S1.2-01 ou S1.2-02. Le contrat
[OpenAPI](../api/openapi.yaml) et le modèle cible
[Prisma](../../apps/api/prisma/schema.prisma), introduits par S1.1 puis
renforcés par le gate S1.2-01, sont les contrats techniques canoniques présents.
S1.2-02 matérialise le schéma Prisma par des migrations PostgreSQL versionnées et
des contraintes SQL ; il ne constitue toujours pas un runtime métier.

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
