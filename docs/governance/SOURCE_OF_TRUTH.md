# KORA+ Final — Source de vérité

Statut : **APPROUVÉ — BASELINE OPÉRATIONNELLE S0.1**

Date d’effet : 2026-07-28

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
Le futur chemin `docs/adr/` et le futur contrat `docs/api/openapi.yaml` ne
peuvent être créés que par un lot qui les autorise.

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

Les contrats OpenAPI, Prisma et clients générés seront ajoutés uniquement dans
les lots qui les autorisent. Ils ne devront jamais contredire un ADR accepté.
