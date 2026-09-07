# Contrats KORA+

Cette zone publie la frontière TypeScript générée du contrat S1.1 Audio Pilot.
La source unique reste `docs/api/openapi.yaml` ; le fichier sous
`src/generated/` est produit et contrôlé par
`scripts/openapi/generate-contract-types.mjs`.

S1.1 fournit des types, pas un client réseau ni une implémentation métier. Les
descripteurs de lecture restent opaques, éphémères, non persistables et non
journalisables. Aucun provider de production, aucune URL média et aucun
identifiant privé de stockage/transcodage ne font partie de la frontière.

La frontière expose aussi les formes d’audit de la politique financière
`FLOOR_SETTLEMENT_WITH_ARTIST_CARRY_V1`. Les numérateurs exacts et la séquence
par artiste y sont des chaînes décimales afin de ne jamais perdre un entier
`BigInt` lors d’une future sérialisation JSON ; les carry entrants et sortants
restent bornés de `0` à `9_999`.
