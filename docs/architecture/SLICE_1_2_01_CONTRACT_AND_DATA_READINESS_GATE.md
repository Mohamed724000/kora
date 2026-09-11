# S1.2-01 — Contract & Data Readiness Gate

Statut : **cible contractuelle et données validée — aucun runtime ni migration**

## Autorité et portée

Ce gate prolonge S1.1, désormais fermé, sans réécrire ses décisions. Le contrat
HTTP canonique reste [`docs/api/openapi.yaml`](../api/openapi.yaml), le modèle
cible reste
[`apps/api/prisma/schema.prisma`](../../apps/api/prisma/schema.prisma), et les
ADR-002, ADR-005, ADR-008, ADR-009, ADR-011, ADR-015, ADR-016, ADR-019 et
ADR-020 gouvernent les invariants ajoutés.

S1.2-01 ne livre aucun contrôleur, service, worker, migration, seed, appel Mux,
objet média, secret, session réelle ou donnée métier. Les 34 chemins OpenAPI
sont une cible contract-first ; seules les routes `/health/live` et
`/health/ready` existent dans le runtime de fondation.

## Delta contractuel

Le contrat S1.2-01 conserve intégralement le pilote S1.1 et ajoute deux chemins
de conception :

- `GET /api/v1/catalog/audio/{contentId}/cover`, représentation binaire
  contrôlée de la couverture active, sans URL ni emplacement privé ;
- `POST /api/v1/media-webhooks/mux`, frontière fournisseur signée, durable et
  idempotente, incapable de publier un contenu.

La surface complète compte 34 chemins, 40 opérations, 87 schémas et 18
invariants. Les ensembles public, mobile authentifié, administration,
fournisseur paiement sandbox et fournisseur média restent disjoints et fermés.

## Readiness du catalogue global MVP

Les listes et détails audio exposent :

- une `PublicCoverImage` en lecture seule, liée au `contentId` de la route et à
  la version média de la publication active ;
- `settledSalesCount`, entier non négatif dérivé uniquement des unités de lignes
  réglées, nettes des unités intégralement remboursées ;
- la valeur exacte `0` avant P4, faute de règlements et remboursements runtime ;
  aucune fixture, estimation ou valeur synthétique n’est admise.

La couverture est résolue par l’opération contrôlée avec le `contentId` et le
`mediaAssetVersion` obligatoires. Cette adresse versionnée interdit qu’une
republication serve ou mette en cache une autre couverture sous la même clé. Le
contrat TypeScript ne contient aucune URL média, clé R2, référence d’asset Mux
ni emplacement source.

## Provenance et sessions administrateur

`Artist` et `AudioContent` portent obligatoirement `createdByAdminId`, attribué
depuis l’acteur administrateur authentifié. Les requêtes d’écriture ne peuvent
ni fournir ni modifier cette provenance. Les relations vers `AdminUser` sont
en suppression et mise à jour `Restrict`. Cette action référentielle ne suffit
pas à rendre la colonne immuable : la future migration devra interdire sa
réaffectation après insertion, et le runtime devra lier création et audit dans
la même transaction avant toute route catalogue.

La cible Prisma complète les données imposées par les ADR administrateur :

- secret TOTP chiffré et horodatage d’enrôlement ;
- `AdminSession` révocable avec famille de token, JTI d’accès, hash et version
  de refresh, dernière activité, fraîcheur du second facteur et expiration ;
- dix codes de récupération générés par le futur service, stockés uniquement
  sous forme de hashes Argon2id et consommables une fois ;
- récupération et reset administrateur obligatoirement audités ;
- `AuditLog` relié par clé composite au même administrateur et à sa session,
  avec action, entité, états avant/après masqués, motif, corrélation et horodatage ;
- idempotence administrative reliée par `Restrict` à son acteur.

Le modèle ne matérialise pas la cardinalité dix ni les durées. Le futur runtime
devra imposer l’enrôlement avant tout accès protégé, TOTP à chaque connexion,
access token 15 minutes, inactivité 8 heures, TOTP récent 5 minutes pour action
sensible, rotation à usage unique et révocation de la famille sur replay. Le
refresh restera dans un cookie `httpOnly`, `Secure`, avec politique `SameSite`
obligatoire adaptée au déploiement, et aucun token ne sera stocké dans
`localStorage`.

## Inbox média et publication

`MediaWebhookInbox` conserve une clé `(provider, providerEventKey)` unique, le
type d’événement, le SHA-256 du corps, le corps chiffré et l’instant de
vérification de signature avant acquittement. Un lien optionnel `Restrict` vers
`MediaAsset` permet le traitement différé. `MediaAsset` sépare les références
privées upload et asset ; chacune est unique dans son fournisseur, attribuée
une seule fois et sert de clé de corrélation déterministe pour les événements
`upload.asset_created`, puis `asset.ready` ou `asset.errored`. Aucun payload
brut en clair n’est persisté par la cible.

Le callback Mux ne change que le processing média dans un futur lot. Il ne crée
jamais `ContentPublication`. Publier exige toujours les versions et checksums
exacts d’un `AUDIO_MASTER` et d’un `COVER_IMAGE` `READY`. Après archivage, une
republication ajoute une nouvelle ligne et préserve l’historique ; elle ne
réouvre ni ne réécrit la publication archivée.

Les contraintes non exprimables par Prisma — unicité partielle de la
publication active, immutabilité des références provider et de la provenance,
cardinalité des codes, vérification cryptographique, atomicité avec audit et
préconditions de dérivation — restent des obligations de migration et de
transaction pour un futur lot explicitement autorisé. Le corps webhook devra
être borné avant lecture brute, vérification HMAC, parsing et persistance ; la
valeur maximale est une décision de sécurité préalable au lot runtime et n’est
pas inventée par ce gate sans autorisation.

## Génération et preuves

`scripts/openapi/validate-openapi.mjs` vérifie la surface exacte, les politiques,
les machines d’état, les schémas publics sûrs et les relations Prisma cibles.
La suite négative démontre notamment le rejet des secrets TOTP en clair, des
provenances client, des couvertures avec emplacement, des ventes synthétiques,
des webhooks non signés/non durables et des suppressions en cascade sur les
preuves.

`scripts/openapi/generate-contract-types.mjs` demeure l’unique générateur de la
frontière TypeScript. Aucun client réseau ou runtime n’est produit par ce gate.

## Condition de passage au lot runtime

Une migration ou une route métier reste interdite jusqu’à une nouvelle
autorisation et devra alors fournir les contraintes SQL, transactions,
contrôles RBAC/TOTP, vérifications Mux, tests de concurrence, sérialisation sans
identifiant privé et rollback non destructif. S1.2-01 ne vaut pas validation de
ces comportements futurs.
