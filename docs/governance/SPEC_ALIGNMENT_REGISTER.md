# KORA+ Final — Specification Alignment Register

Version : 2.1
Baseline préservée : 2.0 du 2026-07-25
Statuts : `Accepted`, `Deferred V2`, `Contract gate`, `Superseded`

Ce registre consolide sans les rouvrir les 40 arbitrages du Resolution Pack V2.
Les sources originales restent immuables. Toute nouvelle contradiction exige
une nouvelle entrée datée et l’autorité prévue par la
[source de vérité](SOURCE_OF_TRUTH.md).

| ID | Domaine | Source A | Source B | Décision | Justification | Impact | ADR | Statut | Date |
|---|---|---|---|---|---|---|---|---|---|
| REG-01 | Dépendance | Back-Office V1.1 | AdminLTE React / npm | Déclarer `apexcharts` séparément de `@adminlte/react`. | Le wrapper ne fournit pas le runtime. | Build reproductible et responsabilité claire. | ADR-001 | Accepted | 2026-07-25 |
| REG-02 | Auth admin | Back-Office V1 | Exigences de sécurité admin | Utiliser TOTP et dix codes de secours ; e-mail seulement pour alerte/récupération. | L’e-mail seul est insuffisant pour la finance. | MFA administrateur renforcée et auditée. | ADR-002 | Accepted | 2026-07-25 |
| REG-03 | Dashboard | Back-Office V1 | Résilience des widgets | Utiliser six endpoints indépendants avec états locaux. | Un endpoint agrégé crée un point de panne unique. | Un widget lent ne bloque pas le dashboard. | ADR-003 | Accepted | 2026-07-25 |
| REG-04 | Audit | Écran d’audit Back-Office | Engineering API | Exposer une API d’audit read-only, paginée et réservée au `super_admin`. | L’écran n’avait pas de contrat d’accès formel. | Preuve exploitable sans accès base direct. | ADR-004 | Accepted | 2026-07-25 |
| REG-05 | API admin | Back-Office V1.1 | Engineering / OpenAPI | OpenAPI précède toute route consommée par l’administration. | Les routes ne peuvent rester implicites. | Contrats vérifiables et absence de dérive. | ADR-009 | Accepted | 2026-07-25 |
| REG-06 | Session admin | Back-Office V1 | Politique de session | Persister session, révocation et fraîcheur TOTP. | Les JWT seuls ne prouvent ni révocation ni step-up. | Contrôle de session testable. | ADR-005, ADR-008 | Accepted | 2026-07-25 |
| REG-07 | Données TOTP | Back-Office V1 | Modèle de sécurité | Stocker secret TOTP chiffré et codes de secours hachés à usage unique. | Les données de récupération étaient absentes. | Enrôlement et récupération sûrs. | ADR-002, ADR-005 | Accepted | 2026-07-25 |
| REG-08 | Éditorial | Écrans bannières | Modèle de données | Ajouter `Banner` et son contrat public. | L’UI n’avait aucune destination durable. | Bannières administrables et auditées. | ADR-006 | Accepted | 2026-07-25 |
| REG-09 | Configuration | Écrans de réglages | Modèle de données | Ajouter `PlatformConfig` versionné et audité. | Les paramètres plateforme n’avaient pas de source durable. | Changements historiques et contrôlés. | ADR-006 | Accepted | 2026-07-25 |
| REG-10 | Terminologie | Benchmark « Achat VIP » | Langage produit KORA+ | Employer uniquement « Soutenir l’artiste » et `ArtistSupport`. | KORA+ doit conserver sa terminologie. | Suppression d’un terme de benchmark copié. | ADR-007, ADR-014 | Accepted | 2026-07-25 |
| REG-11 | Performance | Contraintes Android | Back-office web | Appliquer budgets web et chargement progressif, sans règle RAM Android. | Les environnements n’ont pas les mêmes contraintes. | Critères de performance adaptés. | ADR-003, ADR-009 | Accepted | 2026-07-25 |
| REG-12 | Tests | Back-Office V1.1 | Engineering finance | Exiger au moins 90 % de branches sur la logique financière et ses invariants d’intégration. | Le seuil ne doit pas rester isolé dans l’UI. | Gate financier commun et mesurable. | — | Accepted | 2026-07-25 |
| REG-13 | Session admin | JWT historique | Politique cookie/révocation | Accès 15 min, refresh cookie httpOnly sécurisé, fenêtre d’inactivité 8 h. | Durées et mécanisme étaient ambigus. | Révocation immédiate et session exploitable. | ADR-008 | Accepted | 2026-07-25 |
| REG-14 | Artistes | Mission générale du Cahier | Règles détaillées MVP | Seule l’administration crée, édite et publie au MVP. | La publication artiste contredisait les règles détaillées. | Aucun portail de publication non planifié. | ADR-011 | Accepted | 2026-07-25 |
| REG-15 | Entrée invité | Ancien splash/login | Cahier guest-first | Le splash aboutit à Home ; l’auth apparaît sur action protégée avec `returnTo`. | Le catalogue doit être public immédiatement. | Découverte sans friction. | ADR-010 | Accepted | 2026-07-25 |
| REG-16 | Identité | Alternatives e-mail/social | Identité téléphone | Téléphone vérifié obligatoire, e-mail facultatif, social login hors MVP. | Une identité MVP unique est nécessaire. | Contrats d’authentification cohérents. | ADR-010 | Accepted | 2026-07-25 |
| REG-17 | Billetterie | Critères MVP | Classement V2 | Retirer entièrement Event, Ticket et QR du MVP. | Deux domaines transactionnels augmenteraient le risque. | Billetterie reportée à une slice V2. | ADR-023 | Deferred V2 | 2026-07-25 |
| REG-18 | Paiement | Relation Order-Payment unique | Besoin de retry/provider | Une `Order` possède plusieurs `PaymentAttempt` immuables. | Les tentatives ne doivent pas écraser l’historique. | Retry traçable et idempotent. | ADR-012 | Accepted | 2026-07-25 |
| REG-19 | Finance | Besoin de correction | Modèle financier incomplet | Ledger équilibré append-only et écritures compensatoires obligatoires. | Une correction ne doit jamais modifier un règlement. | Audit et réconciliation fiables. | ADR-013 | Accepted | 2026-07-25 |
| REG-20 | Revenu artiste | Solde artiste | Absence d’accrual et de taux gelé | Créer `ArtistEarning` immuable avec base et `artistRevenueShareBps` gelés. | Les changements futurs ne doivent pas réécrire l’historique. | Revenus reproductibles et auditables. | ADR-014 | Accepted | 2026-07-25 |
| REG-21 | Preview | Preview invitée | Entitlement utilisateur | Séparer `PreviewGrant` anonyme de l’`Entitlement` acheté. | Un invité ne possède pas de droit d’achat. | Preview publique sans droit durable. | ADR-017 | Accepted | 2026-07-25 |
| REG-22 | URL média | Contrats `previewUrl` | Interdiction d’URL brute | Retourner capacité/métadonnées puis descriptor signé court. | Une URL durable exposerait le stockage. | Surface d’extraction réduite. | ADR-011, ADR-017 | Accepted | 2026-07-25 |
| REG-23 | Publication | Statut éditorial | Statut de processing Mux | Séparer `Content.status` et `MediaAsset.processingStatus`. | Le processing ne doit jamais publier implicitement. | Retries média sans corruption éditoriale. | ADR-011 | Accepted | 2026-07-25 |
| REG-24 | Archive | Catalogue public | Promesse d’achat permanent | Masquer publiquement mais conserver l’accès via Entitlement dans Mes achats. | L’archive ne doit pas retirer un droit acquis. | Promesse d’achat permanent tenue. | ADR-016 | Accepted | 2026-07-25 |
| REG-25 | Webhook | Acquittement queue | Durabilité événementielle | Persister Inbox avant acquittement et produire Outbox transactionnelle. | Une panne de worker ne doit perdre aucun événement accepté. | Traitement rejouable et idempotent. | ADR-015 | Accepted | 2026-07-25 |
| REG-26 | Sessions | Refresh incomplet | Step-up et révocation | Rotation, détection de replay, révocation et recent-auth explicites. | Les parcours sensibles nécessitent une assurance testable. | Sessions client et artiste sécurisées. | ADR-010 | Accepted | 2026-07-25 |
| REG-27 | Audit | Exigence « immutable » | Enforcement base absent | Écrire l’audit dans la transaction et interdire UPDATE/DELETE en base. | Une convention applicative seule est insuffisante. | Preuve append-only imposée. | ADR-019 | Accepted | 2026-07-25 |
| REG-28 | Offline | Exigence de chiffrement | Cycle clé/licence incomplet | AES-256-GCM par chunks, clé liée appareil, licence renouvelable, aucun clair au repos. | La possession offline doit rester révocable sans annuler l’achat. | Offline sécurisé et testable. | ADR-018 | Accepted | 2026-07-25 |
| REG-29 | Bibliothèque | UI favoris/playlists | Modèles et API absents | Conserver favoris et playlists simples, à livrer en Slice 3 avant bêta. | L’UI ne peut dépendre de données imaginaires. | Modèles et contrats requis avant affichage. | ADR-021 | Accepted | 2026-07-25 |
| REG-30 | Avis | UI avis/notes | Modération absente | Retirer avis et notes du MVP ; retour en V2 avec modération. | Le contenu social ne peut être non modéré. | Dette sociale évitée au MVP. | ADR-021 | Deferred V2 | 2026-07-25 |
| REG-31 | Notifications | Écrans notification | Modèles de livraison absents | Créer Template, Notification, Delivery, PushToken et Preference avant Slice 6. | Un écran ne constitue pas un système de livraison. | Notifications durables et consenties. | ADR-021 | Accepted | 2026-07-25 |
| REG-32 | Checkout | Quatre fournisseurs visibles | Configuration opérationnelle | Afficher seulement les fournisseurs configurés et opérationnels ; bloquer si aucun. | L’UI doit refléter la capacité réelle. | Aucun faux moyen de paiement. | ADR-012 | Accepted | 2026-07-25 |
| REG-33 | Thème admin | Toggle sombre | Design system clair | Back-office clair uniquement au MVP ; retirer le toggle sombre. | Aucun design system sombre n’est défini. | Dette UI limitée. | ADR-020 | Accepted | 2026-07-25 |
| REG-34 | RBAC | Permissions UI larges | Moindre privilège serveur | RBAC route/action/champ ; support masqué et sans mutation finance/sécurité. | Cacher un bouton ne suffit pas. | Autorisations testables côté API. | ADR-020 | Accepted | 2026-07-25 |
| REG-35 | Flows mobile | Écrans cités | Parcours incomplets | Définir Player root, auth contextuelle et soutien artiste avant code UI. | Les routes et états doivent précéder l’implémentation. | Parcours cohérents et testables. | ADR-010, ADR-014, ADR-016 | Accepted | 2026-07-25 |
| REG-36 | Benchmark | Registre : 15 captures | Document : 16 captures | Le décompte canonique est 16, usage comportemental uniquement. | La preuve doit être correctement inventoriée. | Traçabilité corrigée sans droit de copie. | — | Accepted | 2026-07-25 |
| REG-37 | Revenu | `commissionRatePercent=20` | Part artiste 20 % | Utiliser `artistRevenueShareBps=2000` et le libellé « Part artiste ». | « Commission » inverse le sens économique. | Données et UI financières non ambiguës. | ADR-014 | Accepted | 2026-07-25 |
| REG-38 | Remboursement | Règles de refund | Droits, ventes et fidélité | Le refund total révoque le droit ciblé, compense ventes/revenus et baisse la dépense nette sans déclasser le palier. | Tous les effets doivent rester cohérents. | Finance, droits et fidélité réconciliables. | ADR-013, ADR-016 | Accepted | 2026-07-25 |
| REG-39 | Capture | Promesse absolue | Limites des plateformes | Appliquer les protections disponibles sans garantir l’impossible. | Aucune app ne bloque tout dispositif externe. | Promesse sécurité exacte et testable. | ADR-024 | Accepted | 2026-07-25 |
| REG-40 | Paiement réel | Checkout natif | Règles stores/fournisseurs/légales | Limiter au sandbox jusqu’aux approbations externes. | Aucune exception de distribution ne peut être supposée. | Production et paiements réels restent bloqués. | ADR-022 | Contract gate | 2026-07-25 |

## État consolidé

- Décisions résolues : 40/40.
- Entrées manquantes ou dupliquées : aucune.
- Nouvelle contradiction découverte pendant S0.1 : aucune.
- `REG-40` est un gate contractuel externe, pas une ambiguïté documentaire.

## Propagation obligatoire

Les lots futurs doivent propager ces décisions dans OpenAPI, le modèle Prisma,
la matrice de traçabilité, les flows UI, le RBAC, le Threat Model et la
Definition of Done. Les DOCX originaux ne sont pas réécrits.
