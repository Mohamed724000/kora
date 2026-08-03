# KORA+ Final — Threat Model initial

Statut : **BASELINE DE CONCEPTION + FONDATIONS S0.3 VALIDÉES ET FUSIONNÉES**

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
- surface HTTP NestJS limitée à `/health/live` et `/health/ready`, hors du
  préfixe `/api/v1` réservé aux futures routes applicatives ;
- validation stricte de la configuration au démarrage, sans secret embarqué ;
- probes PostgreSQL et Redis paresseuses, locales et limitées au readiness,
  avec délais clients et borne globale pilotée par `READINESS_TIMEOUT_MS` ;
- corrélation des requêtes et logs Pino avec redaction des en-têtes, champs et
  chaînes de message sensibles ; le champ `msg` Nest reste catégoriel et fixe ;
- client Prisma vide et frontière de contrats explicitement vide ;
- aucune migration, queue BullMQ active, intégration fournisseur, URL média,
  logique financière ou donnée personnelle.

## Menaces et mesures attendues

| Domaine      | Menaces principales                                      | Mesures attendues / autorités                                                                        | État                                                                                          |
| ------------ | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Identité/OTP | Brute force, interception, replay, enumeration           | Rate limits, OTP court et haché, rotation session, logs masqués ; ADR-010                            | Not implemented                                                                               |
| Admin        | Vol de session, MFA contournée, récupération abusive     | TOTP RFC 6238, codes Argon2id, cookies httpOnly, step-up, révocation ; ADR-002/005/008               | Not implemented                                                                               |
| RBAC         | Escalade verticale/horizontale, champs sensibles         | Contrôle serveur route/action/champ, moindre privilège ; ADR-020                                     | Not implemented                                                                               |
| Paiement     | Double débit, faux webhook, replay, ordre inversé        | Signature, idempotence, Inbox/Outbox, PaymentAttempts immuables ; ADR-012/015                        | Not implemented                                                                               |
| Ledger       | Altération, déséquilibre, double comptage                | Append-only, groupes équilibrés, compensation, reconciliation ; ADR-013/014                          | Not implemented                                                                               |
| Droits       | Accès sans achat, révocation excessive                   | Entitlement permanent ciblé, checks serveur ; ADR-016                                                | Not implemented                                                                               |
| Média        | URL brute, partage, scraping, logs sensibles             | Stockage privé, descriptor court, PreviewGrant, device binding ; ADR-011/017                         | Not implemented                                                                               |
| Offline      | Extraction clé/fichier, replay licence, copie appareil   | AES-256-GCM, clé non exportable, licence renouvelable ; ADR-018                                      | Not implemented                                                                               |
| Audit        | Suppression ou falsification                             | Écriture transactionnelle, blocage UPDATE/DELETE, exports audités ; ADR-019                          | Not implemented                                                                               |
| Capture      | Enregistrement écran et dispositif externe               | `FLAG_SECURE`, détection/pause iOS, protections en couches sans promesse absolue ; ADR-024           | Not implemented                                                                               |
| Données/logs | Fuite PII, token ou secret                               | Redaction des champs et messages, `msg` catégoriel, minimisation, contrôle accès, rétention et tests | Foundation validated — CTO technical review passed                                            |
| Supply chain | Package compromis, licence incompatible                  | Versions verrouillées, revue, audit et provenance                                                    | Remediated and qualified — technical and S0.3 legal/license gates passed for the locked scope |
| CI/CD        | Secret exposé, artefact altéré, déploiement non autorisé | Moindre privilège, environnements protégés, provenance et rollback                                   | Not implemented                                                                               |

## Risques ouverts et gates

- Le readiness est borné par `READINESS_TIMEOUT_MS`, y compris lorsqu’une probe
  ne se résout jamais. PostgreSQL et Redis appliquent aussi leurs délais de
  connexion/requête/commande. Les réponses restent génériques et les rejets
  tardifs sont consommés. Les dépendances réelles ne seront introduites qu’en
  S0.4, qui n’a pas commencé.
- Les messages Nest sont assainis avant journalisation structurée et ne sont
  jamais transmis directement comme `msg`. Les tests couvrent token, DSN, mot
  de passe, OTP, email et téléphone sur toutes les méthodes du logger.
- Le NDK Android autorisé `28.2.13676358` est installé et l’APK debug passe.
  Build-Tools `36.0.0` et CMake `3.22.1` ont été installés automatiquement par
  Gradle pendant le build ; leur conservation a été explicitement autorisée
  par le CTO. Cette décision n’autorise aucune autre action globale sur le SDK.
- Les audits npm complet et production passent à zéro après remédiation ciblée
  de PostCSS, sharp, minimatch et brace-expansion. La qualification détaillée
  est versionnée dans `SPRINT_0_3_SECURITY_REMEDIATION.md`.
- Les chemins LGPL, MPL, EPL et CC-BY, leur présence dans les artefacts et les
  mesures proposées sont documentés dans
  `THIRD_PARTY_LICENSE_REVIEW_S0_3.md`. Le gate juridique/licences a été
  approuvé pour le seul périmètre verrouillé de S0.3. Toute future dépendance,
  distribution ou release exige une nouvelle évaluation juridique et licences.
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
