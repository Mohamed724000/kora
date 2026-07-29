# KORA+ Final — Threat Model initial

Statut : **BASELINE DE CONCEPTION + FONDATIONS S0.3 — REVUE CTO EN ATTENTE**

Ce modèle décrit les frontières et mesures attendues. Sprint 0.3 introduit des
shells et quelques contrôles de fondation étroits ; aucun contrôle métier,
financier, média ou d’identité ci-dessous n’est déclaré opérationnel.

## Actifs

- identité client, téléphone vérifié, OTP, sessions et appareils ;
- identité administrateur, TOTP et codes de récupération ;
- Orders, PaymentAttempts, webhooks et idempotency keys ;
- ledger, ArtistEarnings, remboursements, rapprochements et retraits ;
- Entitlements et bibliothèque d’achats ;
- médias privés, descriptors signés, packages et licences offline ;
- données personnelles, préférences et historique ;
- back-office, RBAC, configuration et audit ;
- secrets d’infrastructure et fournisseurs ;
- logs, traces, métriques et exports.

## Frontières de confiance futures

1. Appareil mobile ↔ API publique.
2. Web public ↔ API publique.
3. Back-office ↔ API administrative.
4. API ↔ PostgreSQL/Prisma.
5. API et workers ↔ Redis/BullMQ.
6. API ↔ fournisseurs paiement/SMS.
7. API ↔ R2/Mux.
8. CI/CD ↔ environnements et secrets.
9. Opérateurs ↔ fonctions sensibles et exports.

## Frontières réellement introduites en S0.3

- shells mobile, web public et administration sans appel API ni donnée métier ;
- surface HTTP NestJS limitée à `/api/v1/health/live` et
  `/api/v1/health/ready` ;
- validation stricte de la configuration au démarrage, sans secret embarqué ;
- probes PostgreSQL et Redis paresseuses, locales et limitées au readiness ;
- corrélation des requêtes et logs Pino avec redaction des en-têtes et champs
  sensibles ;
- client Prisma vide et frontière de contrats explicitement vide ;
- aucune migration, queue BullMQ active, intégration fournisseur, URL média,
  logique financière ou donnée personnelle.

## Menaces et mesures attendues

| Domaine | Menaces principales | Mesures attendues / autorités | État |
|---|---|---|---|
| Identité/OTP | Brute force, interception, replay, enumeration | Rate limits, OTP court et haché, rotation session, logs masqués ; ADR-010 | Not implemented |
| Admin | Vol de session, MFA contournée, récupération abusive | TOTP RFC 6238, codes Argon2id, cookies httpOnly, step-up, révocation ; ADR-002/005/008 | Not implemented |
| RBAC | Escalade verticale/horizontale, champs sensibles | Contrôle serveur route/action/champ, moindre privilège ; ADR-020 | Not implemented |
| Paiement | Double débit, faux webhook, replay, ordre inversé | Signature, idempotence, Inbox/Outbox, PaymentAttempts immuables ; ADR-012/015 | Not implemented |
| Ledger | Altération, déséquilibre, double comptage | Append-only, groupes équilibrés, compensation, reconciliation ; ADR-013/014 | Not implemented |
| Droits | Accès sans achat, révocation excessive | Entitlement permanent ciblé, checks serveur ; ADR-016 | Not implemented |
| Média | URL brute, partage, scraping, logs sensibles | Stockage privé, descriptor court, PreviewGrant, device binding ; ADR-011/017 | Not implemented |
| Offline | Extraction clé/fichier, replay licence, copie appareil | AES-256-GCM, clé non exportable, licence renouvelable ; ADR-018 | Not implemented |
| Audit | Suppression ou falsification | Écriture transactionnelle, blocage UPDATE/DELETE, exports audités ; ADR-019 | Not implemented |
| Capture | Enregistrement écran et dispositif externe | `FLAG_SECURE`, détection/pause iOS, protections en couches sans promesse absolue ; ADR-024 | Not implemented |
| Données/logs | Fuite PII, token ou secret | Redaction, minimisation, contrôle accès, rétention et tests | Foundation implemented — pending review |
| Supply chain | Package compromis, licence incompatible | Versions verrouillées, revue, audit et provenance | Foundation incomplete — pending review |
| CI/CD | Secret exposé, artefact altéré, déploiement non autorisé | Moindre privilège, environnements protégés, provenance et rollback | Not implemented |

## Risques ouverts et gates

- NDK Android 28.2.13676358 absent : build APK S0.3 bloqué ; toute installation
  globale exige une autorisation explicite.
- L’installation npm signale 33 vulnérabilités (1 modérée, 32 élevées) :
  résolution obligatoire avant le Go S0.3 ; le détail en ligne n’a pas été
  autorisé à sortir du workspace.
- Les licences installées sont toutes déclarées, mais les obligations LGPL,
  MPL, EPL et CC-BY identifiées exigent une validation CTO/juridique avant
  distribution.
- Docker local inaccessible : blocker S0.4, sans impact sur les fondations S0.3.
- Fournisseurs OTP/paiement et stratégie stores non approuvés : gate avant
  paiement réel.
- Textes légaux, droits média et résidence des données : gate avant bêta.
- KMS, secrets production et isolation environnements : gate production.
- Tests appareils réels, faible mémoire/réseau et anti-capture : gate bêta.
- Pentest, charge, restauration et audit financier : gate production.

## Méthode de mise à jour

Chaque lot affectant une frontière :

1. décrit les actifs et flux nouveaux ;
2. ajoute abus, mesures et risques résiduels ;
3. relie les ADR et exigences ;
4. crée des tests négatifs et preuves ;
5. obtient la revue sécurité prévue ;
6. n’affirme jamais qu’un contrôle non développé est opérationnel.
