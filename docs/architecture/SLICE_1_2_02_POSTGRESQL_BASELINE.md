# S1.2-02 — Baseline PostgreSQL canonique et contraintes SQL

Statut : **PREUVE TECHNIQUE PRÉPUBLICATION DU 2026-09-15 — VALIDÉE**

## Périmètre

S1.2-02 matérialise dans PostgreSQL le schéma Prisma canonique complet de 33
modèles validé par S1.2-01. Il ne crée ni endpoint, contrôleur, service, worker,
authentification runtime, webhook opérationnel, seed, média, interface ou
infrastructure de production. S1.2-03 n’est pas démarré.

Deux migrations ordonnées portent la matérialisation :

1. `20260914000000_canonical_postgresql_baseline` est générée byte-for-byte par
   Prisma 7.9.1 depuis `schema.prisma` ;
2. `20260914000100_canonical_sql_constraints` ajoute exclusivement les garanties
   PostgreSQL non ou insuffisamment exprimables dans Prisma.

Le wrapper `apps/api/prisma/run-baseline-validation.ps1` crée PostgreSQL 18.4 au
digest verrouillé, en `tmpfs` et sur loopback. Le validateur
`apps/api/prisma/validate-baseline.mjs` refuse un hôte non local, exige
`S1202_EPHEMERAL_POSTGRES=1`, vérifie la version serveur, crée deux bases aux
noms bornés, applique les migrations, contrôle leur inventaire, exécute les cas
positifs et négatifs, compare les signatures structurelles, puis supprime
uniquement ces deux bases. Le wrapper supprime ensuite son seul conteneur.

## 1. Invariants matérialisés par SQL dans S1.2-02

| Domaine                | Garantie réellement active après migration                                                                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schéma canonique       | 33 tables applicatives, enums, PK, 54 FK dont deux FK composites fournisseur, et index Prisma complets                                                                                                                                            |
| Isolation              | FK composites client pour session/appareil, droit/commande/ligne/contenu, descripteur/droit/appareil, idempotence/commande et audit admin/session                                                                                                 |
| Sessions client        | au plus une session non révoquée par client, par index partiel                                                                                                                                                                                    |
| Publication            | insertion active obligatoire ; au plus une publication active par contenu ; exactement un master audio et une cover `READY`, aux versions, SHA-256 et dates de vérification antérieures à la publication, contrôlés en fin de transaction         |
| Preuves catalogue      | provenance `Artist.createdByAdminId`, `AudioContent.createdByAdminId` et `ContentPublication.publishedByAdminId` immuable ; lien de publication non modifiable et non supprimable ; seul `archivedAt` peut être affecté une fois                  |
| Références fournisseur | unicité Prisma conservée, cohérence provider/inbox par FK composite, attribution unique et non réaffectable des références paiement et média                                                                                                      |
| États                  | historique obligatoire dans la transaction de création de Order/PaymentAttempt ; séquences sans trou, transitions exactes et états terminaux bloqués ; Settlement et dernier état Order `SETTLED` forment un fait différé bidirectionnel          |
| Montants               | FCFA non négatifs, posting strictement positif, quantité positive, points de base `0..10000`, SHA-256 minuscules, bornes média/preview et idempotence                                                                                             |
| Commande/règlement     | lignes closes dès le premier état ; total Order égal à leur somme ; tentative égale au total/devise et associée à un Order en paiement ; Settlement lié au dernier événement `SUCCEEDED` et à l’état `SETTLED` du même Order                      |
| Ledger                 | comptes et lignes immuables ; groupe non vide avec débits et crédits strictement positifs et totaux exactement équilibrés, vérifié à chaque fin de transaction                                                                                    |
| Finance artiste        | montant brut égal à la ligne tarifée, base Settlement égale aux bases gelées, taux/politique gelés, relations composites, arithmétique exacte `BigInt`, floor/carry et prédécesseur immédiat verrouillé ; agrégats vérifiés en fin de transaction |
| Audit et durabilité    | `AuditLog` rejette `UPDATE`/`DELETE`; preuves financières et publications sont ligne par ligne append-only ; code de récupération et marqueurs Inbox/Outbox/Entitlement sont attribuables une seule fois et chronologiquement bornés              |
| Capacités média        | durées de preview et descripteurs bornées ; aucun emplacement ou secret média n’est ajouté à une surface publique                                                                                                                                 |

Les assertions différées sont des `CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY
DEFERRED`. Elles autorisent la création cohérente de plusieurs lignes dans une
transaction, mais refusent son achèvement si publication, historique, état
Settlement/Order, total de commande, ledger ou allocation artiste est incomplet
ou incohérent.

La migration n’ajoute aucun rôle applicatif PostgreSQL. Les triggers protègent
les rôles ordinaires, mais un superuser ou propriétaire capable de DDL, de
désactiver les triggers ou de `TRUNCATE` reste hors de leur frontière. Le futur
rôle applicatif sans ces privilèges et limité à `INSERT/SELECT` sur `AuditLog`
est donc un durcissement runtime obligatoire, pas une garantie livrée ici.

## 2. Invariants nécessitant encore une transaction applicative future

Les contraintes SQL protègent les invariants énumérés, mais ne remplacent pas
l’orchestration atomique ni les privilèges bornés du futur service :

- créer ensemble Settlement, ledger, ArtistSettlement/ArtistEarning,
  Entitlement et Outbox, ou ne rien créer ;
- créer un groupe ledger et toutes ses lignes une seule fois : le SQL maintient
  l’équilibre à chaque commit, mais sans état canonique de clôture il ne sait pas
  distinguer une paire tardive équilibrée ; le futur rôle ne pourra pas insérer
  directement dans un groupe historique ;
- interdire de compléter tardivement par une ligne à valeur nulle les agrégats
  artiste déjà validés ; le service et son rôle d’écriture doivent réserver les
  inserts à la transaction de règlement initiale ou à une compensation ;
- attribuer l’administrateur authentifié et écrire le `AuditLog` de la mutation
  critique dans la même transaction ;
- verrouiller et consommer le carry selon la séquence imposée avant insertion,
  même si le trigger et les uniques restent le dernier rempart ;
- archiver l’ancienne publication et insérer la nouvelle publication complète
  dans une seule transaction ;
- révoquer atomiquement les sessions client actives avant de créer la nouvelle ;
- appliquer les préconditions dépendantes de `OtpChallenge.purpose` ;
- créer exactement les dix `AdminRecoveryCode` hashés avec l’enrôlement TOTP,
  dans une même transaction, puis remplacer/révoquer l’ensemble de façon
  contrôlée ; le hash individuel et son `usedAt` sont déjà immuables en SQL ;
- vérifier HMAC/authenticité et borne du corps brut avant toute insertion Inbox ;
- créer les compensations de remboursements/chargebacks sans réécrire les
  preuves réglées ;
- garantir la correspondance fonctionnelle de chaque événement Outbox avec la
  mutation métier qui le produit.

Aucun de ces flux applicatifs n’est opérationnel dans S1.2-02.

## 3. Invariants réservés à un lot runtime ultérieur

Restent explicitement non implémentés :

- TOTP, OTP, mot de passe, émission/rotation/replay des tokens et cookies ;
- RBAC API, attribution depuis le principal authentifié et limites de session ;
- endpoints catalogue, ventes, publication, paiement, library et playback ;
- HMAC Mux/sandbox, KMS/chiffrement, limite exacte du corps webhook et workers ;
- appels Mux, stockage R2 et résolution de représentation cover ;
- calcul public `settledSalesCount` net des remboursements ;
- descripteurs signés, liaison appareil, révocation et cache HTTP ;
- fournisseurs de paiement réels, secrets, production et données réelles.

## Preuves et reproductibilité

- baseline Prisma : SHA-256
  `37e97b5bb370447fdfa6cc856c44d8d25dd518b43879ff8cd04c951ad062c6f6` ;
- migration SQL spécifique : SHA-256
  `e316e5fcf0b452c003074ba7e6cf60a07384b68fb2d904cfd387cac54919ffb2` ;
- inventaire par base : 33 tables, 54 FK, 133 index, 47 `CHECK`, 33 fonctions
  et 45 triggers applicatifs ;
- 2 fixtures positives, archivage positif et 63 tests négatifs dont la
  contrainte ou le message causal exact est vérifié ;
- deux applications sur bases vides, second passage sans migration en attente ;
- signature structurelle identique :
  `bdfbbec06bf721c1d9e47df8e2dbf004a1f4db0cc695cb1e4370160081c52fe6` ;
- les deux bases et le conteneur PostgreSQL `tmpfs` ont été supprimés de façon
  ciblée après validation.

## Rollback

Dans l’instantané prépublication du 2026-09-15, le rollback restait la
suppression des seuls fichiers S1.2-02 du worktree. Après toute application
partagée, aucune migration descendante destructive n’est fournie : une
correction doit être une nouvelle migration
versionnée et revue. S1.2-02 n’a touché aucune base ou donnée de production.
