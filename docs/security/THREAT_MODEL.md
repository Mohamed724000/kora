# KORA+ Final — Threat Model initial

État couvert par la preuve prépublication du 2026-09-04 : **BASELINE +
S0.4/S0.5/M0.1/M0.2/S0.6 FUSIONNÉS ET CLÔTURÉS + M0.3-R4 PUBLIÉ SUR LA DRAFT
PR #29 + GATE M0.3-R5 VALIDÉ LOCALEMENT**

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

## Frontières et gates réellement introduits jusqu’à M0.3-R5

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
- gates M0.3/R1/R2/R4/R5 : overrides exacts et ciblés
  `@prisma/config@7.9.1 > deepmerge-ts@8.0.1` et
  `prisma@7.9.1 > mysql2@3.23.1`, plus `fast-uri@3.1.6` sous
  `ajv@8.18.0` et `qs@6.16.0` sous ses trois parents exacts. Les installations
  physiques sont uniques ; les variantes vulnérables, globales, élargies,
  parallèles, mal versionnées ou rattachées à un autre parent sont refusées.
  R5 exige en plus que `node_modules/@prisma/config` reste l’unique parent de
  lock de `deepmerge-ts` dans les quatre sections de dépendances, avec preuve de
  compatibilité Prisma `7.9.1` ;
- S0.6 n’ajoute aucune frontière runtime : il rejoue et documente les preuves
  des fondations sur la baseline
  `40a224edc1dc018a080b6c188a804e361e96b5ef`.

Chronologie supply-chain : M0.3 corrige `deepmerge-ts`; R1 durcit le gate; R2
corrige le premier avis `mysql2`; R3 publie la réconciliation documentaire; R4
traite les nouveaux avis de Security #44 puis est publié avec quatre workflows
#45 verts. La preuve locale prépublication du 2026-09-04 montre que R5 complète
le dernier contrôle de parent de lock. R4 et R5 n’ajoutent aucune frontière
métier ou runtime.

## Menaces et mesures attendues

| Domaine      | Menaces principales                                                                            | Mesures attendues / autorités                                                                                     | État                                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Identité/OTP | Brute force, interception, replay, enumeration                                                 | Rate limits, OTP court et haché, rotation session, logs masqués ; ADR-010                                         | Not implemented                                                                                       |
| Admin        | Vol de session, MFA contournée, récupération abusive                                           | TOTP RFC 6238, codes Argon2id, cookies httpOnly, step-up, révocation ; ADR-002/005/008                            | Not implemented                                                                                       |
| RBAC         | Escalade verticale/horizontale, champs sensibles                                               | Contrôle serveur route/action/champ, moindre privilège ; ADR-020                                                  | Not implemented                                                                                       |
| Paiement     | Double débit, faux webhook, replay, ordre inversé                                              | Signature, idempotence, Inbox/Outbox, PaymentAttempts immuables ; ADR-012/015                                     | Not implemented                                                                                       |
| Ledger       | Altération, déséquilibre, double comptage                                                      | Append-only, groupes équilibrés, compensation, reconciliation ; ADR-013/014                                       | Not implemented                                                                                       |
| Droits       | Accès sans achat, révocation excessive                                                         | Entitlement permanent ciblé, checks serveur ; ADR-016                                                             | Not implemented                                                                                       |
| Média        | URL brute, partage, scraping, logs sensibles                                                   | Stockage privé, descriptor court, PreviewGrant, device binding ; ADR-011/017                                      | Not implemented                                                                                       |
| Offline      | Extraction clé/fichier, replay licence, copie appareil                                         | AES-256-GCM, clé non exportable, licence renouvelable ; ADR-018                                                   | Not implemented                                                                                       |
| Audit        | Suppression ou falsification                                                                   | Écriture transactionnelle, blocage UPDATE/DELETE, exports audités ; ADR-019                                       | Not implemented                                                                                       |
| Capture      | Enregistrement écran et dispositif externe                                                     | `FLAG_SECURE`, détection/pause iOS, protections en couches sans promesse absolue ; ADR-024                        | Not implemented                                                                                       |
| Données/logs | Fuite PII, token ou secret                                                                     | Redaction des champs et messages, `msg` catégoriel, minimisation, contrôle accès, rétention et tests              | Foundation validated locally by S0.6 — no business PII flow                                           |
| Supply chain | Package compromis, licence incompatible, épuisement de pile, SSRF ou déni de service transitif | Versions verrouillées, revue, audit, provenance, scripts qualifiés, six chemins parents exacts et gates de graphe | R4 publié : audits à zéro et licences contrôlées ; R5 prépublication : scanner 66/66, outillage 73/73 |
| CI/CD        | Secret exposé, artefact altéré, déploiement non autorisé                                       | Permissions lecture seule, actions épinglées, scans, timeouts et rollback                                         | R4 : les quatre workflows #45 réussissent sur le head publié exact                                    |

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
  `@prisma/config@7.9.1`. M0.3-R1 durcit le parcours des overrides et rejette
  les variantes globales, élargies, en plage, parallèles ou mal rattachées. Les
  tests bornent le comportement récursif dans un processus enfant et vérifient
  la fusion d’objets ordinaires. La rupture majeure reste interdite pour de
  futurs usages `Map` ou graphes complexes sans nouvelle qualification.
- M0.3-R2 traite `GHSA-3f6p-5ww8-9rcr`, qui permet à un serveur MySQL
  malveillant ou à un intermédiaire réseau de provoquer l’envoi d’identifiants
  en clair via `mysql_clear_password`. Il maintient `prisma` et
  `@prisma/client` en `7.9.1` et remplace
  uniquement leur résolution transitive `mysql2@3.15.3` par `3.22.0`, sous le
  parent exact `prisma@7.9.1`. Le graphe ajoute `sql-escaper@1.5.1` et retire
  `seq-queue@0.0.5` et `sqlstring@2.3.3`. Le scanner rejette toute installation
  vulnérable ou supplémentaire et toute variante d’override hors de ce chemin.
  Les audits complet et production sont à zéro ; le contrôle couvre 1 129
  paquets sans licence absente ou non approuvée.
- Le 2026-09-03, Security #44 sur le head R3 a révélé sept avis uniques : quatre
  high sur `fast-uri@3.1.5`, un moderate sur `mysql2@3.22.0` et deux moderate
  sur `qs@6.15.3`. La propagation du graphe totalise 11 nœuds (7 high,
  4 moderate). Ils couvrent confusion d’hôte/SSRF lors de la normalisation
  d’URI, bombe de décompression du protocole MySQL compressé et dénis de
  service par parsing de query string. R4 impose `fast-uri@3.1.6` sous `ajv@8.18.0`,
  `mysql2@3.23.1` sous `prisma@7.9.1`, et `qs@6.16.0` sous
  `body-parser@2.3.0`, `express@5.2.1` et `superagent@10.3.0`. Les trois
  installations physiques sont uniques et les audits complet/production
  concluent à zéro vulnérabilité.
- Le scanner R4 vérifie les versions et installations exactes, l’absence
  d’installation parallèle et toutes les formes d’override global, rangé,
  wildcard, tag, référence, mal versionné, élargi ou rattaché à un autre
  parent. R5 complète ce gate en rejetant tout parent de lock `deepmerge-ts`
  autre que `node_modules/@prisma/config`, qu’il apparaisse dans
  `dependencies`, `devDependencies`, `optionalDependencies` ou
  `peerDependencies`. Les 65 tests R4 restent actifs ; le scanner R5 passe
  66/66 et l’outillage 73/73. Prisma, Prisma Client et `@prisma/config` restent
  `7.9.1`; `deepmerge-ts` reste `8.0.1`.
- Les overrides restent des mesures temporaires. Chacun devra être retiré
  séparément lorsqu’un parent amont autorisé intégrera officiellement la
  dépendance corrigée correspondante. Tout nouveau graphe exige de rejouer
  audits, licences, tests de scanner et qualification Prisma.
- L’état M0.3-R2 contrôlé est le head
  `68027ed15948228ceef7277ad1fa0a47761751e2`, avec le lockfile SHA-256
  `2041E52ECFB25092FADC32EE207C84DED22E9805233CCEA38889170CD1D08742`.
  Les quatre workflows #43 (`Security`, `Quality Linux`, `Infrastructure` et
  `Launcher Windows`) ont tous conclu `success` sur ce head exact.
- Le head R3 publié est `4b5b914d213e3b3803affc15d0139fe898efcd0f`.
  Sur les workflows historiques #44, Infrastructure, Quality Linux et Launcher
  Windows concluent `success`; Security conclut `failure` uniquement sur les 11
  nœuds d’audit ci-dessus. R4 traite cette cause et est publié au head
  `205a4c2264cc99c065da81799ecfcc7f433e24d0`, avec le lockfile SHA-256
  `E47CEA6A6853ABBDEB5A82A1D537C9C9DA92486D7A9F2EC72891A7A4101E2044`.
  Les workflows #45 Infrastructure `33755877761`, Launcher Windows
  `33755877765`, Security `33755877754` et Quality Linux `33755877780`
  concluent tous `success` sur ce head exact. Le contrôle local R5 du 2026-09-04
  n’a modifié aucun élément du graphe. Les métadonnées de publication R5 font
  foi dans GitHub et ne sont pas auto-référencées dans cette preuve.
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
