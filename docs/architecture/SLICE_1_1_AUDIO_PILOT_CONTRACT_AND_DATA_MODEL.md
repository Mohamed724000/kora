# S1.1 — Contrat et modèle cible du pilote audio

Statut : **implémenté comme gate de conception — aucune route métier ni migration**

## Périmètre et autorité

Ce document accompagne le contrat canonique
[`docs/api/openapi.yaml`](../api/openapi.yaml) et le schéma cible
[`apps/api/prisma/schema.prisma`](../../apps/api/prisma/schema.prisma). En cas
d’écart, OpenAPI fait autorité pour la surface HTTP et les ADR acceptés font
autorité sur les invariants. Les types TypeScript sont générés depuis OpenAPI ;
ils ne constituent pas une deuxième source manuelle.

S1.1 ne livre aucun contrôleur, service, worker, fournisseur, stockage réel,
migration, seed ou écriture en base. Le schéma Prisma décrit la cible à
matérialiser dans un lot ultérieur explicitement autorisé.

## Inventaire contractuel

Les 29 chemins et 35 opérations couvrent les capacités nécessaires au pilote :

| Domaine          | Capacités contractées                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| Opérations       | liveness et readiness existants                                                                  |
| Catalogue public | liste audio paginée par curseur et détail publié, sans donnée média privée                       |
| Identité mobile  | challenge OTP, vérification, refresh, clôture de session et appareils                            |
| Achat            | création/lecture d’Order, création/lecture de PaymentAttempt, reçu et fournisseurs opérationnels |
| Paiement sandbox | fournisseur unique `SANDBOX_NEUTRAL` et webhook durable signé                                    |
| Bibliothèque     | `Entitlement`, contenu archivé représentable et descripteur acheté court                         |
| Preview mobile   | `PreviewGrant` anonyme puis échange contre un descripteur court                                  |
| Administration   | liste, création et édition d’artistes ; liste, création, édition, publication et archivage audio |
| Média privé      | création, état et préparation d’un `MediaAsset`                                                  |

Le Web public peut lire le catalogue et le détail. Les opérations de preview,
lecture et transaction sont explicitement réservées au mobile. Les opérations
administratives exigent un access token admin court et des rôles explicites ;
le cookie de refresh ne peut jamais authentifier directement une mutation. Le
webhook exige la signature sandbox contractée.

## Machines d’état et transitions

Les graphes de transition sont des extensions exécutables
`x-kora-state-machines` du contrat et sont testés contre les enums exposés. Les
changements historiques sont append-only : l’état courant est dérivé du
dernier événement valide, jamais obtenu en écrasant une tentative antérieure.

### Order

`CREATED → PAYMENT_PENDING → SETTLED`

Depuis `CREATED` ou `PAYMENT_PENDING`, une commande peut devenir `CANCELLED`.
`SETTLED` est terminal pour la valeur financière ; une correction ultérieure
utilise une écriture compensatoire et ne réécrit ni la commande ni son
règlement.

### PaymentAttempt

`CREATED → PENDING → SUCCEEDED | FAILED | CANCELLED | EXPIRED`

Un retry crée une nouvelle `PaymentAttempt` rattachée à la même `Order`. La
contrainte `(orderId, idempotencyKey)` rend la création rejouable sans
fusionner deux tentatives. `PaymentAttemptEvent` conserve l’historique séquencé.

### MediaAsset et publication

`PREPARING → UPLOAD_PENDING → PROCESSING → READY | FAILED`

Le processing média ne publie jamais un contenu. Une `ContentPublication`
séparée relie exactement un `AUDIO_MASTER` et un `COVER_IMAGE` `READY`, avec
leurs identifiants, versions et checksums attendus, via
`PublicationMediaAsset`. Archiver ferme la visibilité publique par
`archivedAt`, sans révoquer les `Entitlement` existants.

### Webhook

`RECEIVED → PROCESSING → PROCESSED | REJECTED`

L’Inbox persiste l’événement avant accusé de réception. Le couple
`(provider, providerEventKey)` est unique. Un replay retourne le résultat déjà
connu et ne produit ni second règlement ni second entitlement.

## Modèle cible

Le schéma compte 30 modèles regroupés ainsi :

- identité : `Customer`, `CustomerDevice`, `CustomerSession`, `OtpChallenge`,
  `AdminUser` ;
- catalogue : `Artist`, `AudioContent`, `MediaAsset`, `ContentPublication`,
  `PublicationMediaAsset` ;
- achat : `Order`, `OrderItem`, `OrderStateEvent`, `PaymentAttempt`,
  `PaymentAttemptEvent`, `Settlement` ;
- durabilité : `PaymentWebhookInbox`, `OutboxEvent`, `IdempotencyRecord`,
  `AdminIdempotencyRecord`, `AuditLog` ;
- finance : `LedgerAccount`, `LedgerTransactionGroup`, `LedgerPosting`,
  `ArtistSettlement`, `ArtistEarning` ;
- accès média : `Entitlement`, `PreviewGrant`,
  `PreviewPlaybackDescriptor`, `PurchasedPlaybackDescriptor`.

Les montants sont des `Int` en FCFA, la devise est l’enum fermé `XOF` et les
parts sont des `Int` en points de base.
`ArtistEarning` gèle notamment la base de calcul et
`artistRevenueShareBps`. Le taux artiste autorisé reste `2000`, soit 20 %.

## Règlement financier artiste versionné

La politique obligatoire est
`FLOOR_SETTLEMENT_WITH_ARTIST_CARRY_V1`. Elle travaille uniquement en entiers
et `BigInt`, au niveau de chaque artiste dans un `Settlement`. Le dénominateur
officiel est `10_000n` :

```text
exactNumerator =
  carryInNumerator
  + somme(frozenBasisCfa × artistRevenueShareBps)

payableAmountCfa = exactNumerator div 10_000
carryOutNumerator = exactNumerator mod 10_000
```

La conservation exacte obligatoire est :

```text
carryInNumerator + somme(exactEarningNumerators)
= payableAmountCfa × 10_000 + carryOutNumerator
```

KORA+ paie uniquement les FCFA entiers. Le reliquat compris entre `0` et
`9_999` appartient exclusivement à l’artiste concerné. Le premier règlement de
cet artiste commence à zéro ; chaque suivant consomme exactement une fois le
`carryOutNumerator` de son prédécesseur immédiat et le reproduit comme
`carryInNumerator`. Il n’existe ni arrondi au plus proche, ni
`ROUND_HALF_UP`, ni transfert ou abandon du reliquat à la plateforme.

Exemple obligatoire : `101 × 2 000 = 202 000` donne `20 FCFA` et un carry de
`2 000`. Le règlement suivant ajoute `4 × 2 000 = 8 000` ; avec le carry entrant
de `2 000`, il paie `1 FCFA` et sort un carry nul.

`Settlement` conserve la politique, les totaux, une clé de réconciliation et
`reconciledAt`. `ArtistSettlement` conserve, pour un artiste et ce Settlement,
la séquence, le prédécesseur unique, le carry entrant et sortant, les numérateurs
exacts et le montant payable. Chaque `ArtistEarning` conserve son numérateur
exact. Sa relation composite vers `ArtistSettlement`, combinée aux relations
vers `Settlement`, `OrderItem`, `AudioContent` et `Artist`, prouve le même
Settlement, la même commande, la même ligne, le même contenu et l’artiste
propriétaire du contenu.

## Invariants bloquants

1. Une `Order` existe avant toute `PaymentAttempt`.
2. Une nouvelle tentative ne remplace jamais une tentative existante.
3. Un `Settlement` lie par clés composites la commande, sa tentative et
   l’événement `SUCCEEDED` de cette même tentative ; montant et devise doivent
   correspondre.
4. Un `Entitlement` requiert ce `Settlement` et lie la même commande, le même
   client, la même ligne et le même contenu.
5. Un `ArtistEarning` ne peut exister qu’après un Settlement réconcilié. Sa clé
   composite vers `ArtistSettlement` et ses relations vers la ligne, le contenu
   et l’artiste empêchent tout croisement des quatre identifiants métier ; une
   ligne de commande ne peut être rémunérée deux fois.
6. La finance réglée et le ledger sont append-only ; correction par
   compensation uniquement.
7. Le service transactionnel devra refuser tout groupe ledger dont débits et
   crédits ne s’équilibrent pas exactement.
8. Le règlement crée atomiquement ledger, revenu artiste, entitlement et
   Outbox, ou ne crée rien.
9. Chaque `ArtistSettlement` suit une séquence strictement unique par artiste.
   Son prédécesseur est du même artiste et ne peut être consommé qu’une fois.
   La transaction future devra verrouiller ce prédécesseur, vérifier la séquence
   immédiate et recopier exactement son carry sortant.
10. La politique versionnée conserve chaque unité de numérateur ; le carry reste
    compris entre `0` et `9_999`, sans perte, création ou transfert de valeur.
11. La publication exige les deux kinds requis `READY` aux versions et
    checksums attendus, et au plus une publication active par contenu.
12. L’archivage masque le public, mais conserve l’accès de l’acheteur.
13. Un invité reçoit un `PreviewGrant`, jamais un `Entitlement`.
14. L’Inbox webhook est persistée et dédupliquée avant accusé de réception.
15. Les clés d’idempotence sont bornées et uniques par client ou admin.
16. Aucun replay idempotent ne persiste un descripteur ou token brut ; la
    préparation admin réémet une capability courte pour le même asset.

Les contraintes relationnelles et d’unicité disponibles sans SQL sont
exprimées dans la cible Prisma. Les relations financières utilisent
`onDelete: Restrict` et `onUpdate: Restrict` ; les enregistrements réglés n’ont
pas de champ de mise à jour. L’unicité partielle d’une publication active, les
bornes arithmétiques, le verrou concurrent du carry, l’équilibre du ledger, la
vérification `READY`, l’atomicité et l’interdiction SQL de `UPDATE`/`DELETE`
exigent une migration et/ou une transaction serveur dans des lots runtime
futurs. S1.1 les contracte et les teste comme préconditions, mais ne prétend pas
les appliquer en base. Toute correction future ajoute une écriture
compensatoire et ne modifie jamais les données financières finalisées.

## Confidentialité média et erreurs

Les réponses exposent seulement des identifiants publics et des descripteurs
opaques à durée maximale de 300 secondes. Aucun champ de réponse ne peut
contenir URL média brute, clé d’objet privé, référence Mux interne ou secret
fournisseur. Les descripteurs portent les règles contractuelles
`non-persistable` et `non-loggable`.

Les erreurs client utilisent une enveloppe stable avec code sûr, message en
français simple, identifiant de requête et détails non sensibles. Chaque
opération déclare ses codes et chaque code possède un statut HTTP stable. Les
trois conflits de publication sont distincts et bornés.

## Génération et preuve

`scripts/openapi/generate-contract-types.mjs` produit
`packages/contracts/src/generated/audio-pilot.ts`. Sans `--write`, il échoue si
le fichier généré diverge. Le validateur OpenAPI vérifie la surface exacte, les
références, les erreurs, les clients autorisés, les invariants média/finance et
la structure Prisma. Les tests négatifs prouvent que les dérives critiques sont
rejetées. L’algorithme pur
`scripts/openapi/artist-earning-allocation.mjs` prouve l’arbitrage sans fournir
de runtime métier.

## Rollback

Le rollback de S1.1 consiste à rétablir les seuls fichiers du lot depuis Git.
Il n’existe ni migration, donnée, secret, fournisseur, file de messages ou
ressource externe à annuler.
