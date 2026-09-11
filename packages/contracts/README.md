# Contrats KORA+

Cette zone publie la frontière TypeScript générée du contrat S1.2-01 Audio
Catalog Readiness.
La source unique reste `docs/api/openapi.yaml` ; le fichier sous
`src/generated/` est produit et contrôlé par
`scripts/openapi/generate-contract-types.mjs`.

S1.2-01 fournit des types, pas un client réseau ni une implémentation métier. Les
descripteurs de lecture restent opaques, éphémères, non persistables et non
journalisables. Aucun provider de production, aucune URL média et aucun
identifiant privé de stockage/transcodage ne font partie de la frontière.

La frontière client sépare inscription, connexion, vérification OTP et step-up
authentifié. Les téléphones sont internationaux E.164 avec `+223` comme défaut
produit, et l’OTP de session ne peut suivre qu’une vérification préalable du mot
de passe. Toute réponse métier avec corps suit `{data, meta}` ; toute erreur
suit `{error: {code, message, details}}`. Ces types ne constituent toujours pas
un runtime d’authentification. Les sorties d’inscription ne révèlent pas si le
téléphone existe déjà et `details` est fermé à trois champs non sensibles ;
aucun token, mot de passe, identifiant privé, payload fournisseur ou emplacement
média n’y est permis.

La frontière catalogue ajoute une représentation de couverture contrôlée,
résolue par une opération publique dédiée avec `contentId` et
`mediaAssetVersion` obligatoires, sans URL ni clé privée, et un compteur
`settledSalesCount` en lecture seule. Ce compteur vaut strictement zéro tant que
P4 ne fournit pas les règlements et remboursements réels ; aucune valeur de
démonstration ou synthétique n’est autorisée. Les réponses administratives
exposent la provenance `createdByAdminId`, toujours attribuée par le serveur et
absente des requêtes de création ou de mise à jour.

Le payload Mux est une frontière fournisseur ouverte aux ajouts compatibles du
provider, mais il ne publie aucun identifiant média privé. Le modèle cible
sépare et rend uniques par provider les références privées upload et asset. Le
runtime futur devra borner le corps avant lecture, vérifier sa signature brute,
le chiffrer, persister son SHA-256 et la clé d’événement unique avant
acquittement ; le callback ne publie jamais un contenu. La limite chiffrée reste
à approuver avant ce runtime.

La frontière expose aussi les formes d’audit de la politique financière
`FLOOR_SETTLEMENT_WITH_ARTIST_CARRY_V1`. Les numérateurs exacts et la séquence
par artiste y sont des chaînes décimales afin de ne jamais perdre un entier
`BigInt` lors d’une future sérialisation JSON ; les carry entrants et sortants
restent bornés de `0` à `9_999`.
