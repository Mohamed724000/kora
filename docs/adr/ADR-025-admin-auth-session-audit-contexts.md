# ADR-025 — Contextes d'authentification, de session et d'audit administrateur

Statut : **Accepted**

Date : 2026-09-28
Portée : S1.2-03B, contrat uniquement

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
attribuable n'existe encore. Cela couvre le login initial, la création et la
livraison de l'enrôlement TOTP, la demande de reset et l'acceptation
d'invitation. Dès qu'une session ou un contexte de récupération est prouvé,
toute mutation critique et son `AuditLog` sont atomiques dans une même
transaction. Le sink de succès ne vaut pas implicitement pour tous les échecs :
la table contractuelle par `operationId` envoie toujours un échec sans contexte
prouvé dans `AdminSecurityEvent`, notamment pour TOTP, recovery code, refresh
et reset invalides ; un contexte déjà prouvé suit le sink d'échec explicite.
L'enregistrement est durable avant la réponse d'erreur et atomique avec tout
changement d'état de sécurité.

La future contrainte SQL devra imposer un XOR strict entre les trois contextes,
ainsi que les nullabilités conditionnelles ci-dessus. S1.2-03B ne modifie ni
`schema.prisma`, ni migration, ni SQL : il verrouille le contrat qui devra être
matérialisé en S1.2-03C.

La durée légale de rétention n'est pas inventée dans ce lot : jusqu'à une
décision Produit/juridique distincte, `AuditLog` et `AdminSecurityEvent` sont
append-only et aucune suppression n'est autorisée. Les exports masquent les PII
et embarquent `manifest.json` canonisé RFC 8785 JCS et `manifest.sig`, une
signature JWS compacte détachée Ed25519. Le manifeste lie l'identifiant de
l'export, ses dates et la liste triée exacte des entrées payload avec chemin
relatif NFC sûr, taille et SHA-256. `manifest.json` et `manifest.sig` sont
explicitement exclus de cette liste afin d'éviter toute circularité ; chemins
absolus/traversants/backslash, doublons, entrées manquantes ou supplémentaires
sont rejetés. `signatureKeyId` résout une clé publique du trust bundle de
déploiement ; la rotation conserve les anciennes clés de vérification jusqu'à
expiration de tous les exports liés. Le mot « signed » d'ADR-004 décrit cette
preuve d'intégrité vérifiable ; la livraison reste authentifiée par bearer +
step-up, sans URL signée.

## Conséquences sur les parcours

- La vérification d'un code de récupération consomme le code, révoque les
  anciennes sessions et crée seulement un contexte `MFA_RECOVERY`. Elle ne crée
  jamais une session.
- La confirmation du nouveau TOTP termine la récupération, crée une session et
  livre exactement dix nouveaux codes de récupération une seule fois.
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
actives à 3.

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

Toute implémentation runtime, migration ou interface nécessite une autorisation
distincte.
