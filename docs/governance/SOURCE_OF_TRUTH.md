# KORA+ Final — Source de vérité

Statut : **DOCUMENT OPÉRATIONNEL VIVANT — S1.2-02 CLÔTURÉ — S1.2-03A EN DRAFT PR #45 — R1 PUBLIÉ — PREUVE LOCALE PRÉPUBLICATION R2 VALIDÉE — NON FUSIONNÉ**

Date d’effet : 2026-07-28
Dernière réconciliation documentaire : 2026-09-16

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
depuis ce merge dans une branche et un worktree dédiés. Son état courant est
**Draft PR #45 ouverte ; R1 publié ; preuve locale prépublication R2 validée ;
non fusionné**.
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
La correction R1 ajoute aux seules commandes API les hooks de génération
Prisma et un test de contrat ; elle ne change ni dépendance, ni lockfile, ni
workflow, ni schéma, migration, OpenAPI ou frontière PostgreSQL. Aucun des runs
initiaux n’est relancé ; R1 produit des workflows distincts sur son propre head.

Le commit R1 publié `41b3d8f33a637108814208258a3e99b105be1afc` est le head
courant de la Draft PR #45. Launcher Windows `35155026009`, Security
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
accordé au runtime. Cette preuve locale ne préjuge pas du résultat des futurs
workflows R2.
