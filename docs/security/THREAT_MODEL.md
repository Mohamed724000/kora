# KORA+ Final — Threat Model initial

Statut : **BASELINE + S0.4/S0.5/M0.1/M0.2/S0.6 FUSIONNÉS ET CLÔTURÉS +
M0.3 EN VALIDATION FINALE AVANT DRAFT PR**

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

## Frontières réellement introduites jusqu’à S0.6

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
- PostgreSQL et Redis locaux S0.4, bornés au projet Compose et au loopback ;
- CI S0.5 en lecture seule sur le dépôt, actions épinglées et jobs bornés ;
- Sentry minimal API, Web, Admin et Flutter, inactif sans DSN, sans PII, logs,
  traces, replay, screenshot ni données de requête.
- gates M0.1/M0.2 : pins directs exacts, égalité manifeste/lockfile,
  singleton `@types/react`, politique Dependabot directe patch/minor et
  correction `nanoid@3.3.18` ;
- gate M0.3 : override exact et ciblé
  `@prisma/config@7.9.1 > deepmerge-ts@8.0.1`, installation physique unique,
  refus des versions vulnérables imbriquées et preuve de compatibilité Prisma ;
- S0.6 n’ajoute aucune frontière runtime : il rejoue et documente les preuves
  des fondations sur la baseline
  `40a224edc1dc018a080b6c188a804e361e96b5ef`.

## Menaces et mesures attendues

| Domaine      | Menaces principales                                                                     | Mesures attendues / autorités                                                                             | État                                                                               |
| ------------ | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Identité/OTP | Brute force, interception, replay, enumeration                                          | Rate limits, OTP court et haché, rotation session, logs masqués ; ADR-010                                 | Not implemented                                                                    |
| Admin        | Vol de session, MFA contournée, récupération abusive                                    | TOTP RFC 6238, codes Argon2id, cookies httpOnly, step-up, révocation ; ADR-002/005/008                    | Not implemented                                                                    |
| RBAC         | Escalade verticale/horizontale, champs sensibles                                        | Contrôle serveur route/action/champ, moindre privilège ; ADR-020                                          | Not implemented                                                                    |
| Paiement     | Double débit, faux webhook, replay, ordre inversé                                       | Signature, idempotence, Inbox/Outbox, PaymentAttempts immuables ; ADR-012/015                             | Not implemented                                                                    |
| Ledger       | Altération, déséquilibre, double comptage                                               | Append-only, groupes équilibrés, compensation, reconciliation ; ADR-013/014                               | Not implemented                                                                    |
| Droits       | Accès sans achat, révocation excessive                                                  | Entitlement permanent ciblé, checks serveur ; ADR-016                                                     | Not implemented                                                                    |
| Média        | URL brute, partage, scraping, logs sensibles                                            | Stockage privé, descriptor court, PreviewGrant, device binding ; ADR-011/017                              | Not implemented                                                                    |
| Offline      | Extraction clé/fichier, replay licence, copie appareil                                  | AES-256-GCM, clé non exportable, licence renouvelable ; ADR-018                                           | Not implemented                                                                    |
| Audit        | Suppression ou falsification                                                            | Écriture transactionnelle, blocage UPDATE/DELETE, exports audités ; ADR-019                               | Not implemented                                                                    |
| Capture      | Enregistrement écran et dispositif externe                                              | `FLAG_SECURE`, détection/pause iOS, protections en couches sans promesse absolue ; ADR-024                | Not implemented                                                                    |
| Données/logs | Fuite PII, token ou secret                                                              | Redaction des champs et messages, `msg` catégoriel, minimisation, contrôle accès, rétention et tests      | Foundation validated locally by S0.6 — no business PII flow                        |
| Supply chain | Package compromis, licence incompatible, épuisement de pile lors d’une fusion récursive | Versions verrouillées, revue, audit, provenance, scripts qualifiés, override M0.3 ciblé et gate de graphe | M0.1/M0.2 fusionnés ; gates locaux M0.3 réussis, revues et workflows encore requis |
| CI/CD        | Secret exposé, artefact altéré, déploiement non autorisé                                | Permissions lecture seule, actions épinglées, scans, timeouts et rollback                                 | S0.5/S0.6 fusionnés ; workflows M0.3 en attente de publication du head final       |

## Risques ouverts et gates

- Le readiness est borné par `READINESS_TIMEOUT_MS`, y compris lorsqu’une probe
  ne se résout jamais. PostgreSQL et Redis appliquent aussi leurs délais de
  connexion/requête/commande. Les réponses restent génériques et les rejets
  tardifs sont consommés. PostgreSQL et Redis locaux ont été introduits en
  S0.4, désormais fusionné et clôturé.
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
- Les DSN et comptes Sentry restent une configuration externe non créée par le
  dépôt. Sans DSN, les tests démontrent qu’aucun SDK n’est initialisé.
- Le scan haute confiance du dépôt et de l’historique complète les contrôles,
  mais Gitleaks reste indisponible localement et doit être déclaré
  `NON EXÉCUTÉ`.
- Le gate S0.6 confirme zéro vulnérabilité npm complète/production, zéro
  licence absente ou non approuvée, le manifeste immuable 52/52, une seule
  installation physique `@types/react@19.2.18`, aucune installation npm
  imbriquée dans le lockfile, et zéro alerte Secret Scanning ouverte.
- M0.3 traite `GHSA-ggr8-5vv4-36mx` sans modifier Prisma `7.9.1` : le scanner
  exige une unique installation `deepmerge-ts@8.0.1` sous un override limité à
  `@prisma/config@7.9.1`. Les tests bornent le comportement récursif dans un
  processus enfant et vérifient la fusion d’objets ordinaires. La rupture
  majeure reste interdite pour de futurs usages `Map` ou graphes complexes sans
  nouvelle qualification. L’override devra être retiré dès qu’une version
  stable autorisée de Prisma intégrera officiellement une version corrigée.
- Secret Scanning et sa push protection sont activés sur GitHub. En revanche,
  Dependabot Alerts et Dependabot security updates sont désactivés dans les
  métadonnées du dépôt, et Code Scanning ne possède aucune analyse. S0.6 ne
  modifie pas ces paramètres ; cette exposition externe reste une réserve à
  arbitrer par le CTO. La politique versionnée Dependabot directe patch/minor
  et le scanner bloquant restent opérationnels.
- Le test Sentry réel reste `NON EXÉCUTÉ` faute de DSN autorisé. Les quatre
  implémentations restent inactives sans DSN et leurs tests de redaction
  passent.
- Le build iOS reste `NON EXÉCUTÉ` sous Windows. L’inspection navigateur
  interactive S0.6 est également `NON EXÉCUTÉE` car aucun navigateur intégré
  n’était disponible ; les tests DOM, responsive, accessibilité, captures
  versionnées et goldens stricts ont néanmoins été rejoués ou inspectés.
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
