# KORA+ Final — Master Execution Blueprint

Statut : **APPROUVÉ POUR EXÉCUTION PAR LOTS**

Version : 1.0  
Date d’effet : 2026-07-28  
Autorité technique : ChatGPT Work — CTO & AI Program Director  
Repository cible : `KORA-PLUS-FINAL`

Ce document remplace les anciens blueprints datés de juin 2026 et toute
instruction visant `STREAM/Kora`, `KORA-REBUILD`, Sprint 0A ou Sprint 0B.

Il ne remplace ni le Cahier des charges V4 ni les ADR acceptés. Il transforme
leurs décisions en ordre d’exécution.

## A. Executive Program Summary

### Vision

KORA+ est une plateforme culturelle numérique africaine premium destinée en
priorité au Mali, puis à l’Afrique de l’Ouest francophone et à la diaspora.

En moins de cinq secondes, un nouvel utilisateur doit comprendre qu’il peut :

- découvrir des contenus culturels africains sans créer de compte ;
- voir les prix en FCFA et la preuve sociale ;
- acheter simplement avec son téléphone ;
- retrouver ses achats ;
- écouter, regarder ou lire dans l’application ;
- utiliser certains achats offline de manière sécurisée ;
- soutenir les artistes.

### MVP

Le MVP comprend :

- application Flutter Android/iOS ;
- catalogue public ;
- téléphone vérifié et OTP ;
- achat mobile et paiement sandbox puis réel après certification ;
- entitlements permanents ;
- Mes achats ;
- lecteur interne avec accès signé ;
- offline sécurisé ;
- web public SEO sans achat ni lecture complète ;
- back-office Next.js ;
- espace artiste de consultation ;
- finance artiste, réconciliation et retraits ;
- sécurité, audit, observabilité et exploitation.

### Exclusions

Sont hors MVP :

- billetterie et QR de contrôle ;
- avis, notes et modération sociale ;
- réseau social ;
- recommandation avancée par machine learning ;
- wallet interne ;
- VdoCipher et DRM matériel avancé ;
- publication autonome des contenus par les artistes ;
- achat, lecture complète ou téléchargement depuis le web public.

### Contraintes terrain

- Android avec 2 à 3 Go de RAM ;
- 3G et 4G faibles ou instables ;
- forfaits de données limités ;
- utilisateurs peu technophiles ou peu alphabétisés ;
- français simple ;
- prix FCFA et moyens de paiement adaptés au marché.

### Facteurs critiques de réussite

1. Aucun achat perdu.
2. Aucun média brut exposé.
3. Parcours public immédiatement compréhensible.
4. Paiements et webhooks idempotents.
5. Ledger et audit immuables.
6. Fonctionnement fiable sur faible réseau et faible mémoire.
7. Back-office exploitable par des équipes non techniques.
8. Une seule source de vérité et des lots vérifiables.

## B. Input Coverage & Readiness

### Hiérarchie obligatoire

1. Cahier des charges V4 — produit, métier et périmètre.
2. ADR-001 à ADR-024 acceptés — corrections ultérieures.
3. Engineering Specification + Addendum V1.1.
4. UI/UX Design Specification V1.
5. Back-Office AdminLTE Integration Specification V1.1.
6. Specification Alignment Register.
7. Benchmark Empire Afrique — référence ergonomique uniquement.

### Baseline reconnue

- Resolution Pack V2 lisible, 24 ADR complets et sans doublon.
- Nouveau repository clean room confirmé.
- Aucun ancien code autorisé.
- `AI_OPERATING_MODEL.md` approuvé.
- Le présent Blueprint est approuvé.
- AdminLTE 4.1.0 reste une référence visuelle non exécutable.

### Toolchain retenue

- Git : version disponible sur l’hôte.
- Node.js : `22.18.0`, LTS, baseline Sprint 0.
- npm : `10.9.3`.
- Sous Windows, Codex appelle `npm.cmd` et ne modifie pas la politique
  d’exécution PowerShell.
- Flutter : `3.44.1` stable.
- Dart : `3.12.1`.
- Docker et Docker Compose : versions installées, fonctionnement du daemon à
  vérifier avant le lot infrastructure.
- Conteneurs Node du projet : `node:22-alpine`, pas `node:20-alpine`.

Une mise à jour de major exige une décision documentée et un passage complet de
la CI. Aucun outil global n’est mis à jour pendant un lot métier.

## C. Normalized Product Scope

| Domaine | MVP | V2 / différé |
|---|---|---|
| Découverte | Accueil, catégories, recherche, tendances, nouveautés | Recommandation ML |
| Identité | Téléphone vérifié, OTP, e-mail facultatif | Social login |
| Commerce | Order, PaymentAttempt, sandbox puis fournisseurs réels | Wallet |
| Droits | Entitlement permanent, archive accessible aux acheteurs | Transfert de droits |
| Média | Audio pilote, puis vidéo, podcast, livre et live | VdoCipher |
| Offline | Chiffré, lié à l’appareil, licence renouvelable | DRM matériel avancé |
| Artistes | Ventes, revenus, soutiens, retraits | Publication autonome |
| Admin | Catalogue, utilisateurs, paiements, finance, audit, sécurité | Modules sociaux |
| Fidélité | Paliers monotones sur dépense nette éligible | Mécaniques avancées |
| Billetterie | Exclue | Billets et contrôle QR |
| Avis | Exclus | Notes, avis, modération |

Règles financières normalisées :

- une Order possède plusieurs PaymentAttempts immuables ;
- un paiement réussi crée les écritures équilibrées et, si applicable,
  l’Entitlement ;
- la part artiste d’une vente est de 20 %, soit 2 000 points de base, sur le
  revenu éligible réglé après taxes et remboursements ;
- les frais externes du fournisseur restent un coût plateforme pour la vente ;
- un soutien artiste reverse le montant net collecté après taxes et frais
  inévitables, sans commission KORA+ supplémentaire au MVP ;
- toute correction utilise une écriture compensatoire.

## D. Architecture & Contract Map

### Surfaces

- `apps/mobile` : Flutter, Riverpod, GoRouter ; expérience utilisateur complète.
- `apps/web` : Next.js App Router ; acquisition, catalogue et SEO.
- `apps/admin` : Next.js App Router ; exploitation interne.
- `apps/api` : NestJS ; règles métier, sécurité et intégrations.

### Packages

- `packages/contracts` : schémas, contrats et types générés à partir
  d’OpenAPI lorsque pertinent.
- `packages/config` : configurations TypeScript partagées et politiques.
- `packages/ui` : primitives web réellement partagées, sans logique métier.

Le mobile Flutter ne dépend pas directement de packages TypeScript. Son client
est généré ou validé depuis OpenAPI.

### Données et asynchronisme

- PostgreSQL : source de vérité transactionnelle.
- Prisma : accès et migrations versionnées.
- Redis : cache, rate limiting, verrous et BullMQ.
- BullMQ : traitements asynchrones, jamais source de vérité financière.
- Inbox/Outbox : webhooks durables et effets idempotents.

### Média

- Cloudflare R2 : objets privés.
- Mux : streaming MVP.
- L’API retourne des descriptors ou URLs signés de courte durée.
- Aucun `sourceUrl`, `previewUrl` brut ou secret de stockage dans un client.

### Observabilité

- corrélation de requêtes ;
- logs structurés et masqués ;
- Sentry désactivable sans DSN ;
- métriques paiement, jobs, média et sécurité ;
- aucune donnée sensible dans les logs.

## E. Vertical-Slice Roadmap

### Gate 0 — Governance Freeze

Objectif : rendre les sources exécutables sans ambiguïté.

Sortie :

- documents officiels installés ;
- historique clean room déclaré ;
- ADR complets ;
- Blueprint approuvé ;
- arborescence documentaire canonique ;
- préflight READY pour Sprint 0.1.

### Sprint 0 — Clean-room Foundation

Objectif : quatre applications démarrables, reproductibles et testées, sans
fonction métier.

Sortie :

- Git et monorepo ;
- Flutter, Next.js web/admin et NestJS initialisés ;
- PostgreSQL et Redis locaux ;
- Prisma sans modèle métier prématuré ;
- CI, lint, typecheck, tests et builds ;
- design tokens ;
- observabilité et redaction ;
- documentation vivante.

### Slice 1 — Audio Purchase Pilot

Parcours :

`Accueil public → catalogue → fiche audio → auth contextuelle → téléphone/OTP
→ Order → PaymentAttempt sandbox → Entitlement → Mes achats → lecture signée
→ création du contenu par l’administration`

Le parcours doit fonctionner de bout en bout avant d’ajouter d’autres médias.

### Slice 2 — Discovery & Public Web

- recherche ;
- catégories ;
- tendances et bannières ;
- pages artiste et contenu indexables ;
- deep links vers le mobile ;
- aucun achat ou playback complet web.

### Slice 3 — Library & Media Types

- albums et pistes ordonnées ;
- favoris et playlists simples ;
- historique de lecture ;
- vidéo, podcast, livre et live selon contrats explicites.

### Slice 4 — Secure Offline

- téléchargement par chunks ;
- reprise ;
- chiffrement lié à l’appareil ;
- licence renouvelable ;
- nettoyage à la révocation et à la déconnexion ;
- tests faibles stockage, réseau et mémoire.

### Slice 5 — Artist Finance

- sous-ledger artiste ;
- revenus pending/available/reserved ;
- soutiens ;
- demandes de retrait ;
- historique de statut ;
- relevés et réconciliation.

### Slice 6 — Loyalty, Notifications & Security Operations

- paliers monotones ;
- notifications et préférences ;
- centre de sécurité ;
- alertes, exports et récupération encadrée.

### Beta Hardening

- tests 3G, faible mémoire et accessibilité ;
- drills remboursements, chargebacks et réconciliation ;
- sauvegarde, restauration et rollback ;
- conformité juridique et droits ;
- validation visuelle sur appareils réels.

### Production Readiness

- contrats Orange, Moov, Wave, carte et SMS ;
- stratégie stores approuvée ;
- environnements et secrets de production ;
- tests de charge et pénétration ;
- audit financier indépendant ;
- déploiement progressif et runbooks d’incident.

## F. Dependency Map

Chemin critique :

```text
Sources approuvées
  → Foundation reproductible
  → Contrats OpenAPI et modèle cible
  → Catalogue audio administrable
  → Auth téléphone/OTP
  → Paiement sandbox et ledger
  → Entitlement
  → Lecture signée
  → E2E et réconciliation
```

Parallélisable après stabilisation des contrats :

- shell mobile ;
- shell web ;
- shell admin ;
- API health/config ;
- CI et Docker ;
- tests visuels de fondation.

Toujours séquentiel :

- OpenAPI avant clients ;
- modèles financiers avant migrations ;
- Order avant PaymentAttempt ;
- règlement avant Entitlement ;
- descriptor signé avant player complet ;
- licences avant offline ;
- réconciliation avant paiements réels.

## G. Agent & File-Ownership Plan

Un orchestrateur conserve toujours l’autorité. Trois spécialistes maximum
écrivent en parallèle, uniquement dans des zones disjointes.

| Rôle | Propriété habituelle | Mode |
|---|---|---|
| Orchestrateur | racine, lockfile, AGENTS.md, intégration | écriture |
| Requirements Auditor | exigences, matrice, écarts | lecture seule |
| Software Architect | ADR, contrats, frontières | écriture ciblée |
| Flutter Lead | `apps/mobile/**` | écriture |
| API/Data Lead | `apps/api/**`, contrats autorisés | écriture |
| Web/Admin Lead | `apps/web/**`, `apps/admin/**`, `packages/ui/**` | écriture |
| DevOps Lead | `infra/**`, CI après réservation | écriture |
| Security Lead | threat model et audit | lecture seule par défaut |
| QA Lead | preuves et rapports | lecture seule |
| Design QA | captures et comparaison | lecture seule |

Les fichiers racine ne sont jamais modifiés par un spécialiste. Toute demande
de changement racine revient à l’orchestrateur.

## H. Sprint 0 Detailed Runbook

### S0.1 — Gouvernance et Git

Objectif :

- installer les sources de vérité dans leurs chemins canoniques ;
- créer `AGENTS.md` ;
- initialiser Git uniquement dans la racine validée ;
- créer `.gitignore`, `.editorconfig` et règles de sécurité ;
- enregistrer la baseline sans créer de remote ni pousser.

Interdit :

- code applicatif ;
- package install ;
- secret ;
- consultation d’ancien projet.

Validation :

- liens Markdown ;
- unicité ADR ;
- scan secrets ;
- `git diff --check` ;
- inventaire clean room.

Condition d’arrêt : document obligatoire absent ou héritage détecté.

### S0.2 — Contrat monorepo et versions

Objectif :

- `package.json` racine avec npm workspaces ;
- `.nvmrc` et politique Node `22.18.0` ;
- commandes communes ;
- structure `apps`, `packages`, `infra`, `assets` ;
- validation d’environnement ;
- aucun package métier.

Validation :

- manifeste valide ;
- commandes documentées ;
- aucune substitution de stack ;
- aucun secret.

### S0.3 — Fondations applicatives

Vague parallèle après verrouillage S0.2 :

1. Flutter Lead : `apps/mobile/**`.
2. API/Data Lead : `apps/api/**` et `packages/contracts/**`.
3. Web/Admin Lead : `apps/web/**`, `apps/admin/**`, `packages/ui/**`.

Mobile :

- Riverpod, GoRouter ;
- cinq onglets exacts ;
- primitives loading/vide/erreur/offline ;
- mini-player absent sans média ;
- tests widget et golden déterministes.

API :

- NestJS modulaire ;
- `/api/v1`, `/health/live`, `/health/ready` ;
- configuration validée ;
- Prisma PostgreSQL sans métier ;
- Redis/BullMQ prêts ;
- logs corrélés et masqués.

Web :

- Next.js App Router strict ;
- shell SEO et accessibilité ;
- aucun achat ou player.

Admin :

- Next.js App Router strict ;
- thème clair ;
- `@adminlte/react`, Bootstrap, Bootstrap Icons, TanStack Table, ApexCharts ;
- shell et placeholders uniquement ;
- aucune copie du ZIP AdminLTE.

### S0.4 — Infrastructure locale

Prérequis : Docker daemon accessible.

Objectif :

- PostgreSQL et Redis ;
- health checks ;
- volumes nommés KORA+ ;
- commandes de démarrage et reset ciblées ;
- aucune topologie de production.

Condition d’arrêt : accès Docker non fonctionnel. Les lots précédents restent
valides mais Sprint 0 ne peut pas fermer.

### S0.5 — CI, sécurité et observabilité

- GitHub Actions avec les mêmes commandes que local ;
- lint, typecheck, tests et builds ;
- analyse dépendances et secrets ;
- Sentry prêt et sûr sans DSN ;
- tests de redaction ;
- validation OpenAPI ;
- documentation de rollback foundation.

### S0.6 — Foundation Gate

Validators en lecture seule :

- QA & Release ;
- Security & Privacy ;
- Design QA.

Verdict : PASS, PASS AVEC RÉSERVES ou FAIL.

Slice 1 reste bloquée si :

- une application ne build pas ;
- Docker requis ne fonctionne pas ;
- tests critiques rouges ;
- secret ou héritage détecté ;
- contrats pilotes incohérents ;
- cinq onglets absents ;
- AdminLTE HTML copié.

## I. Slice 1 Detailed Runbook

### P1 — Contrats et modèle pilote

- OpenAPI du catalogue audio, auth, Order, PaymentAttempt, Entitlement,
  playback et admin contenu ;
- Prisma cible ;
- idempotency keys ;
- inbox/outbox ;
- états et erreurs ;
- threat-model delta ;
- tests de contrats.

Aucune migration avant validation Software Architect + Data/Finance +
Security.

### P2 — Catalogue audio administrable

- création brouillon par admin ;
- upload contrôlé et processing séparé ;
- publication ;
- archive ;
- catalogue public ;
- fiche contenu ;
- seed libre de droits ;
- audit transactionnel.

### P3 — Auth contextuelle

- guest session ;
- téléphone normalisé ;
- OTP avec limites ;
- sessions et appareils ;
- aucune obligation d’e-mail ;
- logs sans OTP ni téléphone complet.

### P4 — Order et paiement sandbox

- Order immutable après clôture ;
- PaymentAttempts multiples ;
- webhooks durables avant acquittement ;
- ledger équilibré ;
- part artiste ;
- réconciliation ;
- remboursements compensatoires ;
- tests de doublon, retry et ordre des événements.

### P5 — Entitlement et Mes achats

- activation atomique après règlement ;
- accès permanent ;
- archive accessible aux acheteurs ;
- révocation ciblée après remboursement total ;
- reçus et états pending/failed/success.

### P6 — Lecture signée

- preview mobile anonyme ;
- descriptor court ;
- aucune URL brute ;
- contrôle entitlement ;
- player audio complet ;
- mini-player uniquement avec média réel ;
- métriques sans PII.

### P7 — E2E pilote

Scénario obligatoire :

1. un invité voit un audio ;
2. il déclenche l’achat ;
3. il vérifie son téléphone ;
4. une commande et une tentative sont créées ;
5. le sandbox confirme ;
6. ledger, revenu artiste et entitlement sont cohérents ;
7. Mes achats affiche le contenu ;
8. la lecture signée fonctionne ;
9. l’admin et l’audit retracent le parcours ;
10. aucun média brut n’est exposé.

## J. Quality Engineering Strategy

- Unitaires : règles, validators, state machines et calculs.
- Contrats : OpenAPI, clients et schémas.
- Intégration : PostgreSQL, Redis, jobs, inbox/outbox.
- Widget/golden : mobile, états et tailles 341 px.
- Composants : web/admin, accessibilité et variantes.
- E2E : parcours pilote et rôles.
- Finance : propriétés, doubles webhooks, retries, compensation et
  réconciliation.
- Sécurité : RBAC, TOTP, sessions, redaction, secrets et URLs signées.
- Performance : 3G, latence, mémoire Android, tailles de bundle.
- Visuel : captures déterministes, comparaison et validation Mohamed.

Une validation non exécutée est `NON EXÉCUTÉE`, jamais `PASS`.

## K. Security & Financial Control Gates

| Gate | Preuves minimales |
|---|---|
| Migration financière | modèle revu, invariants, rollback, tests |
| Paiement sandbox | idempotence, inbox/outbox, ledger équilibré |
| Paiement réel | contrats, stores, secrets, certification, réconciliation |
| Publication média | droits, scan, processing, stockage privé |
| Offline | chiffrement, liaison appareil, licence, révocation |
| Retrait artiste | solde disponible, double contrôle, TOTP, audit |
| Admin sensible | cookie httpOnly, TOTP, RBAC API, audit |
| Bêta | E2E, faible réseau, faible mémoire, restauration |
| Production | pentest, charge, audit financier, rollback, monitoring |

## L. Risks, Assumptions & Open Decisions

### Avant Sprint 0.1

- documents canoniques présents ;
- `debug.log` accidentel supprimé après contrôle ;
- ancien prompt déclaré historique ;
- Node/npm policy acceptée.

### Pendant Sprint 0

- accès Docker ;
- compatibilité exacte des versions de packages ;
- identité visuelle et assets officiels ;
- disponibilité Android SDK.

### Avant Slice 1

- modèle Prisma cible ;
- contrat OpenAPI pilote ;
- fournisseur OTP sandbox ;
- stratégie seed audio libre de droits.

### Avant bêta

- contrats sandbox fournisseurs ;
- appareils réels ;
- textes légaux ;
- droits média ;
- support opérationnel.

### Avant production

- contrats paiements/SMS ;
- stratégie stores ;
- infrastructure et coûts ;
- audit sécurité et financier.

### V2

- billetterie ;
- avis ;
- VdoCipher ;
- recommandations avancées ;
- wallet.

## M. Change-Control Protocol

1. Enregistrer le problème dans l’Alignment Register.
2. Appliquer la hiérarchie des sources.
3. Créer ou amender un ADR si architecture ou comportement change.
4. Inscrire la décision datée dans le Decision Log.
5. Mettre à jour OpenAPI avant les clients.
6. Mettre à jour Prisma avant migration.
7. Mettre à jour la matrice de traçabilité et la roadmap.
8. Exécuter les tests affectés.
9. Obtenir le verdict CTO avant le lot suivant.

## N. Codex Lot Template

Chaque lot Codex contient obligatoirement :

1. contexte et statut du repository ;
2. objectif unique ;
3. sources applicables ;
4. fichiers autorisés ;
5. fichiers interdits ;
6. agents, propriété et séquence ;
7. critères d’acceptation ;
8. tests obligatoires ;
9. commandes de validation ;
10. preuves attendues ;
11. conditions d’arrêt ;
12. rapport final en français ;
13. interdiction de démarrer le lot suivant.

Le rapport final contient :

- verdict ;
- état Git initial et final ;
- agents et zones ;
- fichiers modifiés ;
- dépendances ;
- migrations ;
- commandes et résultats ;
- builds ;
- captures UI ;
- sécurité ;
- risques et dette ;
- recommandation du lot suivant.

## Autorisation finale

Ce Blueprint autorise uniquement l’exécution séquentielle des lots explicitement
préparés et approuvés par ChatGPT Work.

Il n’autorise pas Codex à développer l’application entière, à changer la stack,
à prendre une décision business ou à anticiper le lot suivant.
