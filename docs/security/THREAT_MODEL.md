# KORA+ Final — Threat Model initial

Statut : **BASELINE DE CONCEPTION — CONTRÔLES FUTURS NON IMPLÉMENTÉS**

Ce modèle décrit les frontières et mesures attendues. À la fin de S0.1, aucun
contrôle applicatif ci-dessous n’est déclaré opérationnel.

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
| Données/logs | Fuite PII, token ou secret | Redaction, minimisation, contrôle accès, rétention et tests | Not implemented |
| Supply chain | Package compromis, licence incompatible | Versions verrouillées, revue, audit et provenance | Not implemented |
| CI/CD | Secret exposé, artefact altéré, déploiement non autorisé | Moindre privilège, environnements protégés, provenance et rollback | Not implemented |

## Risques ouverts et gates

- Docker local inaccessible : blocker S0.4, sans impact sur S0.1.
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
