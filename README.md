# KORA+ Final

KORA+ Final est la clean room de production du produit KORA+. Le repository est
actuellement limité à sa baseline documentaire et de gouvernance. Aucun code
applicatif, monorepo, package ou environnement local n’est créé par Sprint 0.1.

## État actuel

- Gate 0 et Lots 00, 00B et 00C : terminés.
- Sprint 0.1 : gouvernance prête et Git local initialisé sur `main` ; premier
  commit bloqué par l’absence d’identité Git préexistante.
- Sprint 0.2 et lots applicatifs : non commencés.
- Docker : contrôle différé à S0.4.

Un lot ne peut commencer qu’après autorisation explicite du Product Owner dans
la session active. La présence d’un ancien prompt ne constitue pas une
autorisation.

## Autorités

1. [Cahier des charges V4](docs/source-material/originals/KORA_PLUS_Cahier_des_charges_V4.docx)
2. [ADR-001 à ADR-024 acceptés](docs/source-material/originals/KORA_PLUS_Specification_Resolution_Pack_V2/docs/adr/)
3. Engineering Specification et Addendum V1.1
4. UI/UX Design Specification V1
5. Back-Office AdminLTE Integration Specification V1.1
6. [Source de vérité opérationnelle](docs/governance/SOURCE_OF_TRUTH.md)

La [portée clean room](docs/governance/CLEAN_ROOM_SCOPE.md), le
[modèle opératoire IA](docs/governance/AI_OPERATING_MODEL.md) et le
[Master Execution Blueprint](docs/roadmap/MASTER_EXECUTION_BLUEPRINT.md)
gouvernent l’exécution.

## Référence AdminLTE

L’unique archive de référence est
`docs/source-material/references/adminlte/AdminLTE-master.zip`. Elle reste
non exécutable et ne doit jamais être extraite dans une application.

## Contribuer

Lire [AGENTS.md](AGENTS.md), [CONTRIBUTING.md](CONTRIBUTING.md), le
[workflow Git](docs/governance/GIT_WORKFLOW.md) et la
[Definition of Done](docs/qa/DEFINITION_OF_DONE.md). Ne documenter ni exécuter
aucune commande d’installation tant que le lot correspondant n’est pas
autorisé et que les manifestes n’existent pas.
