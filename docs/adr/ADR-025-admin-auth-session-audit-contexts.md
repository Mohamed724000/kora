# ADR-025 — Contextes d'authentification, de session et d'audit administrateur

Statut : **Accepted**

Date : 2026-09-28
Amendement CTO C1 : 2026-10-02
Portée : S1.2-03B et implémentation runtime locale S1.2-03C1

## Contexte

Les décisions ADR-001 à ADR-024 appartiennent au Resolution Pack immuable. Le
contrat S1.2-03B doit toutefois distinguer sans ambiguïté les actions exécutées
depuis une session administrateur, une récupération MFA bornée ou un traitement
système. Une fausse identité administrateur pour une action système, ou une
session créée trop tôt pendant une récupération, détruirait la valeur probante
de l'audit.

## Décision

Chaque futur `AuditLog` porte exactement un contexte parmi :

- `ADMIN_SESSION` : `actorAdminUserId` et `adminSessionId` sont présents ;
  `adminRecoveryContextId` et `systemExecutionRefHash` sont absents ;
- `ADMIN_RECOVERY` : l'acteur déjà prouvé et `adminRecoveryContextId` sont
  présents ; `adminSessionId` et `systemExecutionRefHash` sont absents ;
- `SYSTEM` : aucun faux administrateur n'est créé ; seul un
  `systemExecutionRefHash` non réversible identifie l'exécution.

`actorAdminUserId` désigne l'auteur de l'action et `subjectAdminUserId` sa
cible. Ils ne sont jamais fusionnés. Les actions sensibles portent également
`reasonCode` et `operatorReason`. L'absence de justification est exposée via
`ErrorDetails.field = operatorReason` et `reason = REQUIRED`.

Chaque entrée conserve aussi une classe `LOGIN`, `SESSION`, `EXPORT` ou
`BUSINESS`, l'entité, les valeurs avant/après masquées, le `requestId`, une
causalité éventuelle et l'administrateur délégant lorsqu'un traitement
`SYSTEM` prolonge une demande humaine. Un traitement système garde un acteur
nul. S'il est autonome, `delegatedByAdminUserId` et `causationEventId` sont
tous deux nuls ; s'il prolonge une demande humaine, ces deux champs sont
obligatoires ensemble et préservent la chaîne de preuve sans usurpation.

Les événements sans contexte d'audit prouvé, succès ou échec, sont écrits dans
un futur `AdminSecurityEvent`, et non dans `AuditLog`, puisqu'aucun acteur
attribuable n'existe encore. Cela couvre le login initial, la première
pré-authentification de création/livraison d'enrôlement TOTP, la demande de
reset et l'acceptation d'invitation. Pour `createAdminTotpEnrollment` et
`deliverAdminTotpEnrollmentQr`, un contexte `MFA_RECOVERY` valide, possédé et
lié au bon acteur, actif et non expiré, route explicitement succès et échecs
vers `AuditLog` en contexte `ADMIN_RECOVERY`, atomiquement avec la mutation.
Un cookie, selector ou identifiant client ne prouve jamais ce contexte ; sans
preuve serveur complète, le sink reste `AdminSecurityEvent`. Dès qu'une session
ou un contexte de récupération est prouvé, toute mutation critique et son
`AuditLog` sont atomiques dans une même transaction. Le sink de succès ne vaut
pas implicitement pour tous les échecs :
la table contractuelle par `operationId` envoie toujours un échec sans contexte
prouvé dans `AdminSecurityEvent`, notamment pour TOTP, recovery code, refresh
et reset invalides ; un contexte déjà prouvé suit le sink d'échec explicite.
L'enregistrement est durable avant la réponse d'erreur et atomique avec tout
changement d'état de sécurité, sauf lorsque cette durabilité est elle-même
indisponible : les mutations non commitées sont alors annulées, une réponse 503
neutre est produite et seule une observation opérationnelle neutralisée est
possible, sans prétendre qu'un audit durable a été écrit.

La future contrainte SQL devra imposer un XOR strict entre les trois contextes,
ainsi que les nullabilités conditionnelles ci-dessus. S1.2-03B ne modifie ni
`schema.prisma`, ni migration, ni SQL : il verrouille le contrat qui devra être
matérialisé en S1.2-03C.

La durée légale de rétention n'est pas inventée dans ce lot : jusqu'à une
décision Produit/juridique distincte, `AuditLog` et `AdminSecurityEvent` sont
append-only et aucune suppression n'est autorisée. Les exports masquent les PII
et embarquent `manifest.json` canonisé RFC 8785 JCS et `manifest.sig`, une
signature JWS compacte détachée Ed25519. Le payload JWS est constitué des octets
UTF-8 du manifeste canonisé JCS. L'en-tête protégé contient exactement
`alg=EdDSA` et `kid=signatureKeyId`. Le signing input RFC 7515 est la
représentation ASCII de `BASE64URL(protected UTF-8)`, un point, puis
`BASE64URL(payload)`, sans padding ; le profil non encodé `b64=false` est
interdit. La sérialisation transmise dans `manifest.sig` est
`protected..signature`, le payload détaché étant reconstruit depuis
`manifest.json`.

Le manifeste lie l'identifiant de l'export, ses dates et la liste triée exacte
des entrées payload avec chemin relatif NFC sûr, taille et SHA-256.
`manifest.json` et `manifest.sig` sont explicitement exclus de cette liste afin
d'éviter toute circularité ; chemins absolus/traversants/backslash, doublons,
entrées manquantes ou supplémentaires sont rejetés. `signatureKeyId` résout une
clé publique du trust bundle de déploiement ; la rotation conserve les
anciennes clés de vérification jusqu'à expiration de tous les exports liés. Le
mot « signed » d'ADR-004 décrit cette preuve d'intégrité vérifiable ; la
livraison reste authentifiée par bearer + step-up, sans URL signée.

## Conséquences sur les parcours

- La vérification d'un code de récupération consomme le code, révoque les
  anciennes sessions et crée seulement un contexte `MFA_RECOVERY`. Elle ne crée
  jamais une session.
- La confirmation du nouveau TOTP termine la récupération, crée une session et
  livre exactement dix nouveaux codes de récupération une seule fois.
- La rotation des codes de récupération consomme le TOTP frais présent dans son
  propre corps et établit directement la preuve `RECOVERY_CODE_ROTATION` liée à
  la session courante. Aucun appel préalable à `/step-up` ni second OTP n'est
  requis ; une preuve antérieure ne remplace pas ce TOTP. Le compteur est
  global par administrateur et son rejeu est refusé. Consommation du compteur,
  remplacement du batch, idempotence et audit forment une transaction unique ;
  la preuve inline n'autorise aucun autre purpose. `RECOVERY_CODE_ROTATION`
  n'est donc pas une valeur admise par le corps générique de `/step-up`.
- Une récupération assistée sépare créateur, approbateur et sujet. Ces trois
  identités sont distinctes ; l'approbateur est `SUPER_ADMIN`, dispose d'un
  step-up frais, et consomme atomiquement un dossier valable 24 heures,
  one-shot et annulable.
- L'inventaire CTO restant exactement borné à 27 opérations, l'annulation n'a
  pas de route autonome : créer un dossier remplaçant annule atomiquement tout
  dossier `PENDING` du même sujet ; la politique serveur annule aussi un dossier
  si son créateur ou son sujet devient inéligible. Chaque transition
  `PENDING → CANCELLED` produit une raison serveur, une causalité et un
  `AuditLog`.
- L'approbation révoque toutes les sessions du sujet, invalide TOTP et codes,
  positionne le compte à `PENDING_MFA` et trace l'approbateur comme acteur et la
  cible comme sujet. Aucun secret n'est communiqué au support.
- La prochaine connexion par mot de passe suit `FIRST_TOTP_ENROLLMENT`.

## Sessions et secrets

Les accès administrateur futurs utilisent un JWT RS256 de 15 minutes. Le
runtime devra vérifier à chaque requête la session active, le statut du compte,
la révocation et `authorizationVersion`, et recharger le rôle côté serveur. Le
rôle du JWT n'est jamais l'unique autorité. L'inactivité est bornée à 8 heures,
la durée absolue à 12 heures, le step-up à 5 minutes et le nombre de familles
actives à 3. Lorsqu'une authentification complète créerait une quatrième
famille, le runtime futur verrouille l'utilisateur, ne compte que les familles
non révoquées dont les fenêtres idle et absolue restent ouvertes, puis révoque
atomiquement les familles LRU nécessaires. L'ordre déterministe est
`lastActivityAt`, puis `createdAt`, puis `id`, tous ascendants. Révocations,
création et audit partagent la transaction ; un échec d'audit annule les effets
non commités. Un refresh tourne une famille existante et n'en crée jamais une
nouvelle. Cette éviction est l'arbitrage CTO du 2026-10-02, pas une ancienne
exigence de 03B.

Le refresh est un secret opaque CSPRNG de 256 bits, cookie `HttpOnly`, `Secure`,
`SameSite=Strict`, host-only et à usage unique. Un replay ou le perdant d'une
course révoque la famille ; le client ne voit que `AUTH_REFRESH_INVALID`.

Les codes de récupération associent un sélecteur public aléatoire à un
vérificateur CSPRNG d'au moins 128 bits dans un alphabet non ambigu. Le futur
stockage utilise Argon2id, 64 MiB, trois itérations, parallélisme 1, sel unique
et version, avec consommation atomique unique. Le `kid` public d'une clé JWT est
autorisé ; l'identifiant interne de clé de chiffrement TOTP ne sort jamais.

TOTP utilise RFC 6238 avec HMAC-SHA-256, six chiffres, une période de 30
secondes, un pas passé et futur accepté et le refus du rejeu dans la fenêtre.
Le secret CSPRNG de 256 bits cible AES-256-GCM en chiffrement enveloppe avec
gestionnaire de clés externe, AAD, version et rotation ; l'ancien identifiant de
clé reste utilisable pour déchiffrer puis ré-encrypter, mais n'est jamais
public. Pré-auth et enrôlement vivent dix minutes, `MFA_RECOVERY` dix minutes,
reset quinze minutes et invitation vingt-quatre heures.

Les profils de rate limit contractuels sont distincts : mot de passe 5/15 min,
TOTP 5/5 min, refresh 10/min et récupération 5/h. Ils combinent IP et digest ou
contexte non brut, appliquent le backoff fixé par le contrat et retournent un
`Retry-After` sans exposer la clé de partition.

Les branches publiques de login, demande/consommation de reset et acceptation
d'invitation utilisent un temps comparable pour les variantes compte ou code
inconnu, expiré, consommé, révoqué et état de compte. Les tests statistiques et
les budgets de latence restent des preuves runtime C1/C2, pas une garantie
opérationnelle de 03B.

Les douze opérations C1 exposent aussi le seul code générique
`SERVICE_UNAVAILABLE` en 503, dans l'`ErrorResponse` fermé et avec un message
uniforme sans nom de dépendance, compte, secret, cookie ou token. Toute
dépendance requise PostgreSQL, Redis, KMS ou d'audit indisponible échoue en mode
fermé ; aucune mutation critique ne réussit sans audit durable. Une perte de
l'accusé de COMMIT est un résultat inconnu, distinct d'un rollback confirmé :
aucun succès ni secret n'est livré avant commit confirmé et aucune répétition
automatique aveugle n'est autorisée. Idempotence et consommation unique restent
applicables. L'enveloppe 503 impose normativement le code, le message, les
détails vides et `retryable=false` ; son exemple n'est pas la seule contrainte.

## Principe PostgreSQL pour le futur runtime C1

Le futur writer C1 emploie une identité et un pool séparés du lecteur 03A. Ses
droits sont bornés aux tables, colonnes et transitions C1 nécessaires ; les
écritures `AuditLog` et `AdminSecurityEvent` sont `INSERT`-only, dans la
transaction métier et sans `RETURNING`. Le lecteur futur utilise une allowlist
explicite de tables et colonnes, y compris sur les tables sensibles existantes ;
le `SELECT` global et les default grants globaux devront être supprimés sans
affaiblir les protections 03A hors exceptions approuvées.

Aucun privilège C2 de rôle, invitation, bootstrap ou reset assisté n'est inclus.
Les candidats de modèles/tables, migrations datées et dépendances restent des
propositions non autorisées. Baseline, upgrade et append-only devront être
prouvés sous mandat runtime distinct ; le présent amendement ne crée ni schéma,
migration, rôle, pool ou provisioning.

Le premier compte ne vient ni d'un seed ni d'un endpoint. Une commande
`admin:bootstrap` one-shot, auditée et hors OpenAPI est différée à C2 ; C1 ne
dispose que de fixtures éphémères de test. S1.2-03B ne crée ni commande ni
compte.

## Séquençage

- S1.2-03C1 : login, TOTP, récupération par code, step-up et sessions runtime ;
- S1.2-03C2 : reset, récupération assistée, audit/exports, invitations, RBAC et
  provisioning contrôlé ;
- S1.2-03C3 : interface d'authentification Admin.

Les modèles, migrations, contraintes XOR et contrôles de concurrence requis par
C1 ou C2 sont des prérequis de leur runtime respectif, jamais un hardening
repoussé après activation. Ils restent absents de 03B et exigent une
autorisation distincte.

## Note de matérialisation C1 — instantané local prépublication du 2026-10-04

Le mandat runtime S1.2-03C1 distinct a matérialisé localement les décisions de
cet ADR : six modèles C1, une migration unique, l'upgrade AuditLog v1/v2 sans
réécriture des lignes historiques, un lecteur et un writer PostgreSQL séparés,
les contraintes XOR et append-only, ainsi que les douze opérations C1. Les
paragraphes ci-dessus rédigés au futur conservent la décision de conception
prise pendant 03B ; ils ne décrivent plus l'état courant du worktree C1.

Dans cet instantané daté, la matérialisation avait été publiée jusqu'à R2 au commit
`59972cc0614842627c8c17717605345eaae277c4` dans la Draft PR #50, toujours
ouverte et non fusionnée. Les quatre workflows R2 ont réussi, puis la revue CTO
terminale a conclu **BLOCK** sur six écarts d'implémentation, sans modifier les
exigences normatives du présent ADR. R3 corrige localement les deux orientations
de membership PostgreSQL, les statuts Auth, le rejeu de confirmation,
l'attribution des échecs post-session, la propagation de l'indisponibilité JWT
et l'audit des refus de révocation. R3 était alors non indexé, non commité et
non publié ; ses validations causales locales avaient conclu au succès. Après
cet instantané, l'état réellement observé dans Git et GitHub fait foi.

Le fournisseur KMS et la signature JWT de production ne sont pas qualifiés ;
l'adaptateur à clés réelles éphémères est exclusivement injecté par les tests.
Sans provider qualifié, C1 échoue fermé. Toute décision Ready, fusion ou
déploiement, toute capacité C2 et toute interface C3 exigent encore une
décision distincte.
