# KORA+ Final — Threat Model initial

Périmètre durable couvert : **BASELINE + S0.4/S0.5/M0.1/M0.2/S0.6 ET M0.3
FUSIONNÉS ET CLÔTURÉS + CONTRATS, MODÈLE CIBLE ET GATES UX S1.1**.

La validation locale S1.1 a été achevée le 2026-09-07. À cet instant, aucun
commit, push ou changement GitHub S1.1 n’avait encore été effectué : il s’agit
d’un instantané historique de prépublication. Tout statut GitHub ultérieur doit
être constaté dans l’historique Git et dans la Draft PR correspondante.

Ce modèle décrit les frontières et mesures attendues. Sprint 0.3 introduit des
shells et quelques contrôles de fondation étroits. S1.1 ajoute des contrats,
un modèle Prisma cible et des composants visuels ; aucun contrôle métier,
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

## Frontières et gates M0.3-R5, complétés contractuellement par S1.1

- shells mobile, web public et administration sans appel API ni donnée métier ;
- surface HTTP NestJS limitée à `/health/live` et `/health/ready`, hors du
  préfixe `/api/v1` réservé aux futures routes applicatives ;
- validation stricte de la configuration au démarrage, sans secret embarqué ;
- probes PostgreSQL et Redis paresseuses, locales et limitées au readiness,
  avec délais clients et borne globale pilotée par `READINESS_TIMEOUT_MS` ;
- corrélation des requêtes et logs Pino avec redaction des en-têtes, champs et
  chaînes de message sensibles ; le champ `msg` Nest reste catégoriel et fixe ;
- avant S1.1, client Prisma vide et frontière de contrats explicitement vide ;
- surface OpenAPI S1.1 de 32 chemins et 38 opérations, sans contrôleur
  consommateur runtime ;
- modèle Prisma cible S1.1 à 30 modèles, sans migration, base modifiée ni seed ;
- types audio générés depuis OpenAPI avec contrôle de dérive ;
- primitives Flutter et administration sans appel API, faux contenu runtime ou
  intégration fournisseur ;
- aucune migration, queue BullMQ active, intégration fournisseur, URL média,
  logique financière exécutée ou donnée personnelle réelle ;
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
- S0.6 est fusionné au SHA
  `a602fd38f32d018867c8a058deace0325b4a7c31`, baseline initiale de S1.1 ;
- S1.1 borne contractuellement les futures frontières mobile/API/admin, paiement
  sandbox et média privé par contrat uniquement ; leur activation reste
  interdite. Lors de la validation locale du 2026-09-07, le lot n’était ni
  publié ni fusionné.

Chronologie supply-chain : M0.3 corrige `deepmerge-ts`; R1 durcit le gate; R2
corrige le premier avis `mysql2`; R3 publie la réconciliation documentaire; R4
traite les nouveaux avis de Security #44 puis est publié avec quatre workflows
#45 verts. La preuve locale prépublication du 2026-09-04 montre que R5 complète
le dernier contrôle de parent de lock. R4 et R5 n’ajoutent aucune frontière
métier ou runtime.

## Menaces et mesures attendues

| Domaine      | Menaces principales                                                                            | Mesures attendues / autorités                                                                                                                                         | État                                                                                                                                |
| ------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Identité/OTP | Brute force, interception, replay, enumeration                                                 | Rate limits, OTP court et haché, rotation session, logs masqués ; ADR-010                                                                                             | Contract/target model S1.1 — runtime not implemented                                                                                |
| Admin        | Vol de session, MFA contournée, récupération abusive                                           | TOTP RFC 6238, codes Argon2id, cookies httpOnly, step-up, révocation ; ADR-002/005/008                                                                                | Not implemented                                                                                                                     |
| RBAC         | Escalade verticale/horizontale, champs sensibles                                               | Contrôle serveur route/action/champ, moindre privilège ; ADR-020                                                                                                      | Not implemented                                                                                                                     |
| Paiement     | Double débit, faux webhook, replay, ordre inversé                                              | Signature, idempotence, Inbox/Outbox, PaymentAttempts immuables ; ADR-012/015                                                                                         | Sandbox contract/target model S1.1 — runtime not implemented                                                                        |
| Ledger       | Altération, déséquilibre, double comptage                                                      | Append-only, groupes équilibrés, compensation, reconciliation ; ADR-013/014                                                                                           | Target model S1.1 — runtime balance not implemented                                                                                 |
| Droits       | Accès sans achat, révocation excessive                                                         | Entitlement permanent ciblé, checks serveur ; ADR-016                                                                                                                 | Contract/target model S1.1 — runtime not implemented                                                                                |
| Média        | URL brute, partage, scraping, logs sensibles                                                   | Stockage privé, descriptor court, PreviewGrant, device binding ; ADR-011/017                                                                                          | Contract/target model S1.1 — runtime not implemented                                                                                |
| Offline      | Extraction clé/fichier, replay licence, copie appareil                                         | AES-256-GCM, clé non exportable, licence renouvelable ; ADR-018                                                                                                       | Not implemented                                                                                                                     |
| Audit        | Suppression ou falsification                                                                   | Écriture transactionnelle, blocage UPDATE/DELETE, exports audités ; ADR-019                                                                                           | Target model S1.1 — runtime not implemented                                                                                         |
| Capture      | Enregistrement écran et dispositif externe                                                     | `FLAG_SECURE`, détection/pause iOS, protections en couches sans promesse absolue ; ADR-024                                                                            | Not implemented                                                                                                                     |
| Données/logs | Fuite PII, token ou secret                                                                     | Redaction des champs et messages, `msg` catégoriel, minimisation, contrôle accès, rétention et tests                                                                  | Foundation validated locally by S0.6 — no business PII flow                                                                         |
| Supply chain | Package compromis, licence incompatible, épuisement de pile, SSRF ou déni de service transitif | Versions verrouillées, revue, audit, provenance, scripts qualifiés, parents exacts, gates de graphe, sorties Next reproductibles et exceptions de licence nominatives | M0.3 publié et vert ; S1.1-R2 publié au head `851bd1d…`, puis qualification locale S1.1-R3 des deux variantes libvips Linux exactes |
| CI/CD        | Secret exposé, artefact altéré, déploiement non autorisé                                       | Permissions lecture seule, actions épinglées, scans, timeouts et rollback                                                                                             | R4 : les quatre workflows #45 réussissent sur le head publié exact                                                                  |

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
- Le 2026-09-09, le workflow Security S1.1-R1 `34286291903` a établi une
  baseline de 11 vulnérabilités npm pour le graphe complet (2 moderate, 8 high,
  1 critical) et 7 pour la production (6 high, 1 critical). S1.1-R2 traite les
  avis courants en conservant les branches majeures : Next et ESLint Config
  Next `16.3.4`, Vitest et `@vitest/mocker` `4.1.11`, `js-yaml` `3.15.2` et
  `4.3.2`, Sharp `0.35.4` avec `libheif@1.23.2`, et Multer `2.3.0` uniquement
  sous `@nestjs/platform-express@11.1.28`. Toutes les versions NestJS et Prisma
  restent inchangées.
- Les gates S1.1-R2 imposent les pins de workspaces, les installations
  physiques approuvées et les parents exacts du lockfile. Ils rejettent toute
  variante globale, élargie, mal versionnée, en plage, wildcard, tag,
  référence, parallèle ou attachée à un autre parent, sans affaiblir les gates
  M0.3. Le lockfile
  `417A15E68EB637F7426E52FB0022ADBFF3825C7BE1097145DC4A12F6312E245F`
  se reproduit par deux installations de 1 137 paquets ; audits complet et
  production zéro, `npm ls --all` code 0, licences 1 131/0/0, scanner 75/75 et
  outillage 226/226.
- Next `16.3.4` régénère dans les deux `next-env.d.ts` suivis l’import
  `./.next/types/root-params.d.ts`. Le périmètre R2 final compte donc 12
  fichiers. Deux passages ciblés Web/Admin, typecheck inclus, conservent pour
  chacun de ces fichiers le SHA-256
  `1862AC4BBBC5192D4BF562161DF66EA547ED3E67173100656AB606AE9797DB2B` et
  le même diff Git ; supprimer cet import recréerait un diff au build suivant.
- Les installations, audits, licences, tests globaux et validations sans
  rapport avaient réussi avant cette correction de sortie générée et n’ont
  pas été rejoués.
- Le workflow Security R2 `34373860535` a ensuite confirmé les audits à zéro
  mais rejeté les variantes optionnelles
  `@img/sharp-libvips-linux-x64@1.3.3` et
  `@img/sharp-libvips-linuxmusl-x64@1.3.3`. R3 qualifie exclusivement ces deux
  tuples et leur licence déclarée `LGPL-3.0-or-later` ; aucune licence LGPL,
  famille `@img`, autre version ou autre paquet ne devient globalement
  approuvé.
- Les paquets Linux ne sont pas présents dans l’installation Windows et aucune
  bibliothèque libvips n’est modifiée localement. Ils ne sont intégrés ni aux
  bundles navigateur ni à l’APK Flutter, mais peuvent être embarqués dans un
  artefact serveur Linux. Toute distribution reste bloquée par un gate
  juridique/release distinct couvrant licences, notices, sources
  correspondantes, conditions LGPL et packaging réel.
- La revue S0.3 des variantes `1.3.2` est un précédent historique, pas une
  autorisation automatique de `1.3.3`. La qualification technique R3 n’est ni
  une autorisation générale de LGPL ni une autorisation de release.
- Multer `2.3.0` corrige les dénis de service et le contournement de limite
  suivis par `GHSA-wc9g-mqfw-jrwm`, `GHSA-qfvm-cv95-jqjf`,
  `GHSA-qvfw-j98x-7q72` et `GHSA-535w-7cp7-47q4`. R2 n’ajoute aucun runtime
  d’upload. Avant toute future implémentation, le runtime devra fixer
  explicitement un `fieldArrayIndexLimit` minimal adapté au produit et le
  qualifier par tests de limites.
- Ces preuves S1.1-R2 décrivent l’instantané local prépublication du
  2026-09-09 : aucun commit, push ou changement de la Draft PR #36 R2 n’avait
  encore été effectué. Tout statut ultérieur fait foi dans l’historique Git et
  la PR correspondante ; S1.2 restait non démarré à cet instant.
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
- S1.1 spécifie une inscription et une connexion distinctes : téléphone E.164
  et mot de passe sont vérifiés avant l’OTP. La vérification crée la seule
  session client active et la révocation des sessions actives antérieures doit
  être atomique. Le refresh est rotatif, à usage unique ; son replay révoque la
  famille. Le step-up OTP est distinct, exige une session `customerBearer`
  existante et ne crée pas de nouvelle session. Les ensembles public,
  `customerBearer`, bearer admin court avec RBAC explicite et signature webhook
  sandbox sont fermés et validés. Un cookie de refresh admin ne peut pas
  authentifier directement une mutation. Le lot n’implémente ni émission,
  rotation, validation, rate limit ni révocation ; les lots runtime doivent
  fournir leurs tests d’abus avant usage.
- Le contexte OTP cible conserve seulement les hashes du code, de l’empreinte
  appareil et, pour l’inscription, du mot de passe pending. L’horodatage de
  vérification password et les relations composites client/session lient le
  challenge au parcours initial ; les sorties publiques ne distinguent pas un
  téléphone déjà connu. Les contraintes dépendantes du `purpose` restent des
  préconditions transactionnelles à implémenter et tester dans le runtime.
- Les réponses métier avec corps sont contractées sous `{data, meta}` et les
  erreurs sous `{error: {code, message, details}}`. Le validateur parcourt les
  réponses de chaque opération, exige des objets fermés et limite `details` à
  trois champs non sensibles. Il rejette aussi les alternatives OR anonymes,
  les sécurités racine implicites et les opérations métier non classées.
- Les clés d’objet privé et références fournisseur existent uniquement dans le
  modèle serveur cible. Le validateur interdit leur exposition contractuelle ;
  le futur mapping ORM/API devra conserver cette frontière avec des tests de
  sérialisation négatifs.
- L’équilibre du ledger, les montants non négatifs, l’unicité partielle de la
  publication active et la précondition média `READY` nécessitent migration
  et/ou transactions serveur. Prisma exprime les relations composites et
  unicités possibles sans prétendre matérialiser ces invariants avant S1.2.
- Les records d’idempotence client/admin ne stockent aucun body. Un replay de
  préparation média retrouve le même asset et réémet une capability courte,
  sans persister ni rejouer le token brut.
- Les sessions et appareils client, les descripteurs achetés avec leurs droits
  et appareils, ainsi que les records d’idempotence avec leurs commandes sont
  liés par `customerId` composite et `Restrict`. Les tests négatifs retirent
  chaque liaison séparément pour prouver que le gate refuse tout croisement de
  tenant. La migration et les transactions d’application restent futures.
- Le règlement artiste est borné par la politique versionnée
  `FLOOR_SETTLEMENT_WITH_ARTIST_CARRY_V1` : arithmétique `BigInt`, floor des
  FCFA payables et reliquat de numérateur conservé pour le même artiste. Un
  `ArtistSettlement` porte une séquence unique, un prédécesseur composite du
  même artiste et une référence de prédécesseur consommable une seule fois.
  La transaction future devra verrouiller ce prédécesseur pour empêcher deux
  consommations concurrentes, imposer le carry initial nul et vérifier
  l’équation de conservation avant insertion.
- Chaque `ArtistEarning` est relié par clé composite au même
  `ArtistSettlement`, Settlement, commande, ligne, contenu et artiste. Les
  relations financières utilisent `Restrict`; les enregistrements finalisés
  sont append-only et toute correction passe par une écriture compensatoire.
  Le modèle et l’algorithme pur testent ces préconditions, mais restent une
  cible sans migration, transaction, paiement ou exécution financière réelle.
- Les descripteurs de lecture sont contractuellement opaques, courts,
  non persistables et non journalisables. Leur signature, rotation, liaison
  appareil et révocation restent un gate runtime ultérieur.

## Méthode de mise à jour

Chaque lot affectant une frontière :

1. décrit les actifs et flux nouveaux ;
2. ajoute abus, mesures et risques résiduels ;
3. relie les ADR et exigences ;
4. crée des tests négatifs et preuves ;
5. obtient la revue sécurité prévue ;
6. n’affirme jamais qu’un contrôle non développé est opérationnel.
