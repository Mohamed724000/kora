# KORA+ Final — MVP Execution Plan

Statut : **APPROUVÉ — PLAN VIVANT**
Méthode : lots séquentiels et vertical slices contract-first
Autorité : [Master Execution Blueprint](MASTER_EXECUTION_BLUEPRINT.md)

Ce document consolide le plan V2 du Resolution Pack avec le séquencement
clean-room approuvé le 2026-07-28. Les anciens titres Sprint 0A/0B et les
réparations d’un Flutter historique sont conservés uniquement comme historique.

## État des gates et lots

| Gate ou lot | Objectif | Statut |
|---|---|---|
| Gate 0 | Sources approuvées et readiness clean room | Completed |
| Lot 00 | Preflight read-only | Completed |
| Lot 00B | Remédiation documentaire | Completed |
| Lot 00C | Canonicalisation AdminLTE | Completed |
| S0.1 | Gouvernance et Git | Completed |
| S0.2 | Contrat monorepo et versions | Completed |
| S0.3 | Fondations applicatives | Implemented — pending CTO review |
| S0.4 | Infrastructure locale | Not started — Docker blocker connu |
| S0.5 | CI, sécurité et observabilité | Not started |
| S0.6 | Foundation Gate | Not started |
| Slice 1 et suivantes | Fonctionnalités produit | Not started |

## Sprint 0 — Clean-room foundation

### S0.1 — Gouvernance et Git

Livrables :

- documents d’autorité et documents vivants reliés ;
- règles d’agents et de contribution ;
- registre des 40 arbitrages et Decision Log consolidés ;
- matrice de traçabilité vivante, Definition of Done et Threat Model ;
- manifeste SHA-256 des sources immuables ;
- Git local sur `main` ;
- premier commit seulement avec identité Git préexistante.

Sortie actuelle : baseline gouvernée publiée sur `main`, aucun code applicatif
et aucune dépendance.

### S0.2 — Contrat monorepo et versions

Statut : **Completed**

Livré dans le périmètre autorisé :

- politique Node 22.18.0 et npm 10.9.3 ;
- workspaces npm explicites pour web, administration, API et packages partagés ;
- mobile Flutter maintenu hors des npm workspaces ;
- commandes communes avec état `NON EXÉCUTÉ` explicite en l’absence
  d’application ;
- arborescence canonique réservée sous `apps`, `packages`, `infra` et `assets` ;
- lockfile racine reproductible, sans dépendance ;
- aucun package métier ni début de Sprint 0.3.

### S0.3 — Fondations applicatives

Statut : **Implemented — pending CTO review**

Livré dans le périmètre autorisé :

- shell mobile Flutter avec Riverpod, GoRouter et cinq onglets canoniques ;
- shells Next.js séparés pour le web public et l’administration ;
- shell NestJS sous `/api/v1`, health checks et limites Prisma/Redis explicites ;
- packages partagés étroits pour les contrats, la configuration et l’UI ;
- format, lint, typecheck, tests, builds non mobiles et smokes applicatifs ;
- états de fondation et goldens mobiles, sans comportement métier ;
- aucune migration, file BullMQ, logique financière ou intégration fournisseur.

Réserves de revue : le build iOS n’est pas exécutable sous Windows, les
captures runtime Web/Admin n’ont pas été réalisées, et la validation visuelle
finale du Product Owner ainsi que la revue juridique restent obligatoires.

### S0.4 — Infrastructure locale

Statut : **Not started — Docker blocker connu**

- PostgreSQL et Redis locaux ;
- health checks et volumes nommés ;
- reset strictement ciblé ;
- aucune topologie de production.

Le daemon Docker doit être accessible avant ce lot. Son indisponibilité ne
remet pas en cause les lots précédents.

### S0.5 — CI, sécurité et observabilité

Statut : **Not started**

- mêmes validations en local et CI ;
- analyse de secrets et dépendances ;
- logs structurés et redaction ;
- Sentry sûr sans DSN ;
- validation OpenAPI et rollback de fondation.

### S0.6 — Foundation Gate

Statut : **Not started**

Validation indépendante QA, sécurité et design. Aucun validateur ne corrige
silencieusement un défaut.

## Slice 1 — Audio purchase pilot

Statut : **Not started**

Parcours cible :

`Home public → catalogue → fiche audio → auth contextuelle → téléphone/OTP →
Order → PaymentAttempt sandbox → Entitlement → Mes achats → lecture signée →
création du contenu par l’administration`

Travaux contract-first :

- contrats OpenAPI et modèle cible ;
- catalogue audio administrable ;
- auth téléphone/OTP ;
- paiement sandbox, Inbox/Outbox et ledger ;
- Entitlement et Mes achats ;
- descriptor de lecture signé ;
- E2E et réconciliation.

Gate : un achat audio sandbox complet, réconcilié, sans URL média brute.

## Slices suivantes

| Slice | Contenu | Statut |
|---|---|---|
| 2 — Discovery & Public Web | Recherche, catégories, tendances, SEO et deep links ; aucun achat/playback web | Not started |
| 3 — Library & Media Types | Albums, favoris, playlists, historique, vidéo, podcast et livre | Not started |
| 4 — Secure Offline | Chunks chiffrés, reprise, licence liée appareil et révocation | Not started |
| 5 — Artist Finance | Earnings immuables, soutien, soldes, retraits et réconciliation | Not started |
| 6 — Loyalty, Notifications & Security | Paliers, préférences, delivery et opérations sécurité | Not started |

## Gates bêta et production

### Bêta

- certification sandbox ;
- tests 3G, faible mémoire et accessibilité ;
- remboursements, chargebacks et réconciliation ;
- droits, vie privée, sauvegarde, restauration et rollback ;
- validation visuelle sur appareils réels.

### Production

- stratégie stores et contrats paiement/SMS ;
- secrets/KMS et environnements isolés ;
- tests de pénétration et charge ;
- audit financier indépendant ;
- déploiement progressif et runbooks.

## V2

- billetterie et QR ;
- avis, notes et modération ;
- VdoCipher ou DRM matériel avancé ;
- WebAuthn, wallet et recommandation avancée.

## Règles permanentes

- OpenAPI avant clients.
- Modèles financiers avant migrations.
- Order avant PaymentAttempt ; règlement avant Entitlement.
- Descriptors signés avant player complet.
- Licences avant offline.
- Réconciliation avant paiements réels.
- Aucun lot ou feature ne passe à `In progress` sans autorisation explicite.
