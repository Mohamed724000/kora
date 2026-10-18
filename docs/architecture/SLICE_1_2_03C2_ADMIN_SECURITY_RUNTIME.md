# S1.2-03C2 — Admin Security Runtime Contract

Statut : **P0/R1–R5 PUBLIÉS DANS LA DRAFT PR #51 — R6 QUALIFIÉ LOCALEMENT
ET AUTORISÉ POUR PUBLICATION SOUS GATES, CI R6 NON ACQUISE AU 2026-10-13 —
FOUNDATIONS C2a ET MÉTIER P0–P9 QUALIFIÉS LOCALEMENT, NON PUBLIÉS — C2b/C3
NON COMMENCÉS**

Date : 2026-10-12

Autorité : [ADR-026](../adr/ADR-026-admin-security-c2-runtime-contract.md),
[ADR-025](../adr/ADR-025-admin-auth-session-audit-contexts.md), ADR-004 et
ADR-019.

## Frontière P0

P0 modifie uniquement le contrat OpenAPI, son validateur, son générateur, la
frontière Contracts et la documentation autorisée. L’inventaire demeure :

- 60 chemins, 67 opérations et 141 schémas ;
- 12 opérations C1 intégrées et inchangées ;
- 15 opérations C2 contractées, sans route runtime ;
- cinq retraits historiques de SUPPORT inchangés ;
- aucun Prisma, migration, provisioning, rôle PostgreSQL, dépendance, lockfile,
  workflow, interface, appel fournisseur ou déploiement.

Le contrat généré expose adminC1ContractPolicies,
adminC2ContractPolicies et adminSecurityOperations. Il n’est jamais édité à la
main.

## Matrice d’exécution C2

| operationId                 | Preuve/roles                     | Step-up           | Justification                                              | Sink succès / échec prouvé            | Action / classe / entité                     |
| --------------------------- | -------------------------------- | ----------------- | ---------------------------------------------------------- | ------------------------------------- | -------------------------------------------- |
| requestAdminPasswordReset   | public, aucun contexte           | N/A               | N/A                                                        | SecurityEvent / SecurityEvent         | même operationId / LOGIN / reset request     |
| resetAdminPassword          | contexte PASSWORD_RESET serveur  | N/A               | N/A                                                        | AuditLog recovery / AuditLog recovery | même operationId / LOGIN / admin user        |
| createAdminRecoveryCase     | session + SUPER_ADMIN ou SUPPORT | N/A               | recovery, raison requise                                   | AuditLog / AuditLog                   | même operationId / BUSINESS / recovery case  |
| listAdminRecoveryCases      | session + SUPER_ADMIN ou SUPPORT | N/A               | N/A                                                        | NONE / NONE                           | même operationId / BUSINESS / snapshot cases |
| getAdminRecoveryCase        | session + SUPER_ADMIN ou SUPPORT | N/A               | N/A                                                        | NONE / NONE                           | même operationId / BUSINESS / recovery case  |
| approveAdminRecoveryCase    | session + SUPER_ADMIN            | RECOVERY_APPROVAL | recovery, raison requise                                   | AuditLog / AuditLog                   | même operationId / BUSINESS / recovery case  |
| listAdminAuditLogs          | session + SUPER_ADMIN            | N/A               | N/A serveur                                                | AuditLog / AuditLog                   | même operationId / EXPORT / audit snapshot   |
| createAdminAuditLogExport   | session + SUPER_ADMIN            | AUDIT_EXPORT      | AUDIT_EXPORT, raison requise                               | AuditLog / AuditLog                   | même operationId / EXPORT / audit export     |
| getAdminAuditLogExport      | session + SUPER_ADMIN            | N/A               | N/A serveur                                                | AuditLog / AuditLog                   | même operationId / EXPORT / audit export     |
| downloadAdminAuditLogExport | session + SUPER_ADMIN            | AUDIT_EXPORT      | N/A serveur                                                | AuditLog / AuditLog                   | même operationId / EXPORT / audit export     |
| createAdminInvitation       | session + SUPER_ADMIN            | INVITATION        | INVITATION_ADMINISTRATION, raison requise                  | AuditLog / AuditLog                   | même operationId / BUSINESS / invitation     |
| acceptAdminInvitation       | public, invitation one-shot      | N/A               | N/A                                                        | SecurityEvent / SecurityEvent         | même operationId / BUSINESS / invitation     |
| listAdminUsers              | session + SUPER_ADMIN            | N/A               | N/A serveur                                                | NONE / NONE                           | même operationId / BUSINESS / users snapshot |
| changeAdminUserRole         | session + SUPER_ADMIN            | ROLE_CHANGE       | ROLE_ADMINISTRATION, raison requise                        | AuditLog / AuditLog                   | même operationId / BUSINESS / admin user     |
| changeAdminUserStatus       | session + SUPER_ADMIN            | STATUS_CHANGE     | STATUS_ADMINISTRATION ou SECURITY_RESPONSE, raison requise | AuditLog / AuditLog                   | même operationId / BUSINESS / admin user     |

Tout échec avant preuve produit exactement un AdminSecurityEvent. Les actions
SYSTEM de worker sont distinctes de l’operationId HTTP. Elles sont soit
autonomes, soit causées par un `AuditLog` avec administrateur délégant prouvé,
soit causées par l'`AdminSecurityEvent` d'un reset public via
`causationSecurityEventId`, sans administrateur délégant. Les snapshots
before/after sont des projections masquées positives propres à l’action.

### Continuation SYSTEM du reset public

La transaction de demande crée ensemble le reset durable, l'outbox chiffré et
l'`AdminSecurityEvent` initial. Aucun des identifiants de liaison ne traverse
la réponse publique. Le worker charge ces liaisons depuis PostgreSQL et refuse
une source dont le type, l'action `requestAdminPasswordReset`, la classe
`LOGIN`, l'entité `ADMIN_PASSWORD_RESET_REQUEST`, la demande ou l'outbox ne
correspond pas. Il ne peut ni accepter un identifiant client, ni déduire un
acteur depuis l'e-mail, le compte destinataire ou `subjectAdminUserId`, ni
reclasser la livraison en SYSTEM autonome.

Le futur SQL conserve deux clés étrangères distinctes :
`causationEventId -> AuditLog.id` pour une délégation administrateur et
`causationSecurityEventId -> AdminSecurityEvent.id` pour le reset public, avec
`RESTRICT` en suppression/mise à jour. Un CHECK impose exactement
`null/null/null`, `AuditLog/null/admin` ou
`null/AdminSecurityEvent/null` pour les trois branches SYSTEM; le nouveau lien
est nul hors SYSTEM. Le worker lit seulement les colonnes de validation de la
source/demande/outbox et insère l'audit sans RETURNING. Le writer de demande
insère atomiquement les trois enregistrements. Aucun UPDATE/DELETE de sink ni
élargissement du reader C1 n'est permis.

## États et atomicité

### Reset

Le contexte PASSWORD_RESET durable existe avant la transaction critique et ne
peut être remplacé par MFA_RECOVERY. La transaction consomme le contexte,
change le mot de passe Argon2id, incrémente authorizationVersion, révoque les
sessions et écrit AuditLog ADMIN_RECOVERY. TOTP et codes de secours sont
préservés. Aucun enrollment, session ou bypass MFA n’est créé.

### Recovery assistée

La création annule atomiquement les dossiers PENDING antérieurs du sujet,
persiste le nouveau dossier, l’idempotence et l’audit. L’approbation exige un
SUPER_ADMIN distinct avec step-up RECOVERY_APPROVAL et consomme le dossier
one-shot. Les transitions serveur d’annulation/expiration ont leur propre
action SYSTEM et causalité.

### Invitation

La comparaison e-mail est ASCII case-insensitive, sans rewriting plus/dot, avec
orthographe de livraison préservée. Compte existant : conflit. Une seule
invitation valide existe par e-mail canonique. Le remplacement révoque
atomiquement l’invitation précédente et sa livraison en attente.

### Idempotence

Les six mutations déclarées idempotentes conservent 24 heures une clé portée
par acteur, opération, clé et digest du payload. Même payload : même résultat,
sans nouveau secret ni delivery. Payload différent : 409. Le rejeu recharge
l’autorisation et ne prolonge aucune expiration.

## JSON malformé et 503

Les neuf POST JSON exacts de l’ADR-026 mappent seulement l’erreur causale
entity.parse.failed/SyntaxError/statut 400/POST/route exacte/application-json
vers 400 VALIDATION_ERROR. Le requestId est conservé; un seul SecurityEvent est
requis; AuditLog, cookies, secrets et mutations sont absents. 413, 415,
URIError, GET, autres routes, préfixes et autres erreurs traversent inchangés.

Les 27 opérations Admin déclarent le même 503 fermé. Pour C2, un échec du
recorder, d’une dépendance requise ou d’une durabilité critique retourne ce 503
sans fuite. Rollback confirmé, rollback non confirmé et issue COMMIT inconnue
restent trois branches distinctes; aucune issue inconnue n’est retentée
aveuglément.

## Notification et compromission du mot de passe

Le futur NotificationPort accepte un message sans secret dans une URL. Le code
clair est éphémère. État métier, outbox chiffré et sink durable partagent une
transaction. Le worker revalide expiration, révocation et remplacement avant
delivery; son acknowledgement est distinct du commit initial. L’état permet
une livraison incertaine sans promesse exactly-once.

Le futur PasswordCompromisePort applique l’API range HIBP : préfixe SHA-1
seulement, padding activé, jamais le mot de passe ou le hash complet. Une panne
ou réponse inutilisable échoue en mode fermé. SHA-1 n’est pas un mécanisme de
stockage; Argon2id reste obligatoire. L’UTF-8 exact n’est pas normalisé.

P0 ne sélectionne, n’installe ni n’appelle aucun provider ou SDK.

## Pagination C2

listAdminRecoveryCases, listAdminAuditLogs et listAdminUsers utilisent les
paramètres dédiés AdminC2Cursor et AdminC2Limit :

- défaut 25, maximum 50 ;
- ordre createdAt DESC puis id DESC ;
- curseur opaque authentifié lié au principal, à l’opération et aux filtres ;
- 400 VALIDATION_ERROR pour curseur invalide, incompatible ou expiré ;
- snapshot serveur de projection sûre, transaction cohérente ;
- rechargement de l’autorisation à chaque page ;
- durée 15 minutes ;
- maximum 10 000 entrées ou 25 MiB UTF-8 ;
- dépassement explicite « restreindre les filtres », sans troncature.

Pour l’audit, le snapshot est matérialisé avant l’écriture de l’événement de
lecture. Ces limites ne définissent aucune rétention légale.

## Export d’audit

Les filtres sont AND et partagent les bornes de snapshot : 10 000 entrées,
25 MiB UTF-8 non compressés, aucune troncature. Le ZIP privé chiffré est
référencé de façon opaque, jamais par URL signée. Il expire 24 heures après
READY; sa suppression ne touche pas la source AuditLog PostgreSQL.

La projection est une allowlist par action. Secret, e-mail brut, IP brute,
justification libre et champ inconnu non approuvé ne sont pas exportés. Le
profil signé R4 reste RFC 8785 JCS UTF-8 puis JWS detached Ed25519 avec entrée
de signature RFC 7515; b64=false demeure interdit. Clé Ed25519, clé JWT et clé
de stockage sont séparées.

Le worker revendique des jobs bornés/idempotents. Un COMMIT inconnu est
réconcilié. Avant le premier octet, autorisation, step-up AUDIT_EXPORT,
intégrité et audit durable sont établis. Après le premier octet, une panne
interrompt le stream sans JSON ni faux succès d’audit.

## Bootstrap CLI futur

Le CLI hors OpenAPI :

1. acquiert un garde singleton PostgreSQL ;
2. refuse si un AdminUser existe ;
3. crée exactement un SUPER_ADMIN/PENDING_MFA ;
4. ne crée ni TOTP, recovery codes ou session ;
5. reçoit les secrets via stdin protégé ou secret store ;
6. écrit création, garde et AuditLog SYSTEM autonome atomiquement ;
7. n’affiche que des identifiants et statuts non secrets ;
8. neutralise un COMMIT inconnu, sans retry ;
9. emploie une identité bootstrap future dédiée et minimale.

P0 ne crée ni commande, compte, rôle ou permission.

## Livraison future C2a/C2b

C2a contient onze opérations reset, invitation, recovery, users et RBAC, plus
le bootstrap hors API. C2b contient quatre opérations audit/export. La somme
reste 15 C2 et les 12 opérations C1 ne sont pas modifiées.

Allowlist C2a proposée :

- apps/api/src/admin-security/admin-security.module.ts
- apps/api/src/admin-security/admin-security.controller.ts
- apps/api/src/admin-security/admin-security.service.ts
- apps/api/src/admin-security/admin-security.repository.ts
- apps/api/src/admin-security/admin-notification.port.ts
- apps/api/src/admin-security/admin-password-compromise.port.ts
- apps/api/src/admin-security/admin-notification.worker.ts
- apps/api/src/admin-security/admin-bootstrap.command.ts
- apps/api/test/admin-security-c2a.integration.spec.ts
- apps/api/prisma/schema.prisma

Allowlist C2b proposée :

- apps/api/src/admin-security/admin-audit-query.service.ts
- apps/api/src/admin-security/admin-audit-export.service.ts
- apps/api/src/admin-security/admin-audit-export.worker.ts
- apps/api/test/admin-security-c2b.integration.spec.ts
- apps/api/prisma/schema.prisma

Ces listes sont des propositions de décision future, non des autorisations de
runtime. Aucun wildcard n’est utilisé. Aucun chemin de migration n’est nommé :
le futur mandat doit fournir son chemin littéral exact, sans timestamp inventé.
Si leur modification est nécessaire, `apps/api/src/app.module.ts` et
`apps/api/src/app.factory.ts` devront eux aussi être nommés littéralement dans
ce mandat runtime; ils ne sont pas autorisés ni modifiés par P0/R2.

## Identités et ACL PostgreSQL futures

Le reader C1 n’est jamais élargi. Les identités C2a writer, notification
worker, C2b audit reader/export worker et bootstrap sont séparées par besoin.
Elles ne reçoivent ni ownership, membership dans l’une ou l’autre orientation,
PUBLIC/default grant, grant option ou droits transverses.

Les sinks AuditLog/AdminSecurityEvent sont INSERT-only et sans RETURNING. Les
lectures d’audit passent par une projection masquée. Chaque writer/worker ne
reçoit que les tables, colonnes et transitions nécessaires. Les noms réels,
grants SQL, modèle Prisma et migration restent à décider et tester dans les
lots runtime.

## Gates futurs

Avant toute publication runtime : migration littérale, tests PostgreSQL des
deux orientations de membership, ACL et absence de droits implicites; preuves
HTTP réelles des 15 opérations; concurrence et idempotence; rollback confirmé,
rejeté, suspendu et connexion perdue; borne monotone, état ReadyForQuery,
discard exactement une fois et absence de double release; COMMIT inconnu sans
rollback affirmé ni replay; Redis/worker/outbox; provider adapters et failure
modes; scanner, licences, audits et builds applicables.

Dans P0, PostgreSQL, Redis, Docker, HTTP réel, API build, Flutter, navigateur
et fournisseurs sont **NON EXÉCUTÉS**.

## R3 — flux audit versionné et intégrité de bout en bout

Le flux futur C2b est verrouillé dans cet ordre : stockage PostgreSQL existant
→ projection allowlistée v1/v2 → filtres exacts → snapshot immuable →
assemblage du ZIP → manifeste JCS et signature JWS Ed25519 → hash du ZIP final
→ chiffrement de stockage → déchiffrement et vérification byte-identiques →
audit durable de l'action avant le premier octet → téléchargement byte-identique.

Le reader sélectionne les colonnes nécessaires ; il ne lit pas
`AuditLog.reason` pour une projection v1. `version=1` produit des identifiants
historiques textuels, toutes les métadonnées v2 à `null` et
`legacyReasonRedacted=true`. `version=2` exige classe, contexte et motif, puis
applique les trois contextes et les trois origines SYSTEM R2. Liste et export
sérialisent tous deux `AdminAuditLogEntry`.

Les filtres communs acteur/action/entité/date opèrent sur les valeurs physiques
représentables. `auditVersion` compare la version exacte. Les filtres
`auditEventClass`, `auditContext` et `auditReasonCode` lisent uniquement les
colonnes v2 : une v1 ne correspond jamais, et aucune valeur par défaut n'est
fabriquée. En leur absence, une v1 reste dans le snapshot si les filtres
communs correspondent. Le curseur est lié au jeu et aux valeurs exactes des
filtres.

Le service d'audit sélectionne `reasonCode` depuis la table normative de
l'ADR-026 : quatre opérations HTTP utilisent un motif serveur fixe, six
valident le motif client, et sept transitions SYSTEM utilisent une origine R2
et une source serveur précises. Un motif client absent/invalide après preuve
devient `SECURITY_RESPONSE` avec `operatorReason=null`; le texte invalide n'est
copié ni dans le motif normalisé ni dans la colonne de compatibilité, qui reçoit
le littéral serveur `C2_RUNTIME`.

Le worker calcule les hashes individuels du manifeste, signe le manifeste selon
R4, ferme le ZIP, puis calcule `contentSha256` sur tous les octets de ce ZIP
final — y compris `manifest.json` et `manifest.sig` — avant chiffrement. Le
champ n'entre jamais dans le ZIP. READY interdit toute recompression ou
reconstruction. Le téléchargement vérifie que le plaintext déchiffré a le même
hash et transmet exactement ces octets. EXPIRED conserve le hash et supprime
seulement l'artefact dérivé. Une panne après le début du stream interrompt le
flux et ne fabrique aucun audit de complétion.

R3 ne crée aucun runtime, rôle, ACL, modèle Prisma, migration, stockage ou
provider. La surface devient 60 chemins, 67 opérations et 139 schémas en
nommant les deux branches de projection ; C2a/C2b et C3 restent non commencés.

## Gel R4 — matrice synchrone exécutable

Cette matrice résume la politique machine-readable OpenAPI ; les valeurs
exactes de chaque contrôle et sink sont celles de `operationMatrix` et
`operationExecutionMatrix`.

| Opération                   | Entrée                                | Preuve serveur                       | Autorisation puis métier                  | Mutation/snapshot                                            | Audit + COMMIT                                                         | Réponse / continuation            |
| --------------------------- | ------------------------------------- | ------------------------------------ | ----------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- | --------------------------------- |
| requestAdminPasswordReset   | JSON email                            | aucune identité admin                | éligibilité sans oracle                   | reset + outbox chiffrée                                      | SecurityEvent, transaction confirmée                                   | neutre / notification             |
| resetAdminPassword          | JSON reset + mot de passe             | recovery PASSWORD_RESET actif et lié | finalité + politique/HIBP                 | mot de passe, version, révocations                           | AuditLog v3, transaction confirmée                                     | après COMMIT / aucune             |
| createAdminRecoveryCase     | JSON sujet/motif + idempotence        | session/JTI/version active           | rôle SA/SUPPORT, sujet/motif/idempotence  | annule pending puis crée case                                | audit initiateur + audits SYSTEM d'annulation dans la même transaction | après COMMIT / expiry SYSTEM      |
| listAdminRecoveryCases      | filtres/cursor                        | session/JTI/version active           | rôle SA/SUPPORT, limites snapshot         | snapshot matérialisé                                         | aucun AuditLog de succès; transaction read/snapshot confirmée          | page / aucune                     |
| getAdminRecoveryCase        | id case                               | session/JTI/version active           | rôle SA/SUPPORT, visibilité               | lecture                                                      | aucun AuditLog de succès; aucune écriture durable                      | enveloppe / aucune                |
| approveAdminRecoveryCase    | id + motif + step-up + idempotence    | session/JTI/version active           | SA, step-up RECOVERY_APPROVAL, case/sujet | reset PENDING_MFA + révocations                              | AuditLog v3, transaction confirmée                                     | après COMMIT / aucune             |
| listAdminAuditLogs          | filtres/cursor                        | session/JTI/version active           | SA, budget projection                     | snapshot avant audit                                         | AuditLog v3, transaction confirmée                                     | page / aucune                     |
| createAdminAuditLogExport   | filtres/motif + idempotence           | session/JTI/version active           | SA, step-up AUDIT_EXPORT, budget          | snapshot + job PENDING                                       | AuditLog v3, transaction confirmée                                     | 202 / build-expiry SYSTEM         |
| getAdminAuditLogExport      | id export                             | session/JTI/version active           | SA, visibilité                            | lecture état                                                 | AuditLog v3, transaction confirmée                                     | enveloppe / aucune                |
| downloadAdminAuditLogExport | id export                             | session/JTI/version active           | SA, step-up AUDIT_EXPORT                  | état READY non expiré, intégrité, lease lecture              | AuditLog v3 début, transaction confirmée                               | ZIP exact / observation terminale |
| createAdminInvitation       | JSON email/rôle/motif + idempotence   | session/JTI/version active           | SA, step-up INVITATION, collision email   | invitation + outbox                                          | AuditLog v3, transaction confirmée                                     | après COMMIT / delivery SYSTEM    |
| acceptAdminInvitation       | JSON code/mot de passe                | aucune identité admin                | invitation single-use + HIBP              | consume + PENDING_MFA + credential Argon2id + préauth 10 min | SecurityEvent, transaction confirmée                                   | FIRST_TOTP après COMMIT / aucune  |
| listAdminUsers              | filtres/cursor                        | session/JTI/version active           | SA, limites snapshot                      | snapshot matérialisé                                         | aucun AuditLog de succès; transaction read/snapshot confirmée          | page / aucune                     |
| changeAdminUserRole         | id + rôle/motif/step-up/idempotence   | session/JTI/version active           | SA, step-up ROLE_CHANGE, dernier SA       | rôle + version + révocations + annulations case              | audit initiateur + audits SYSTEM d'annulation dans la même transaction | après COMMIT / aucune             |
| changeAdminUserStatus       | id + statut/motif/step-up/idempotence | session/JTI/version active           | SA, step-up STATUS_CHANGE, dernier SA     | statut + version + révocations + annulations case            | audit initiateur + audits SYSTEM d'annulation dans la même transaction | après COMMIT / aucune             |

## Gel R4 — matrice des transitions SYSTEM transactionnelles et asynchrones

| Transition                           | Source et liaison                                                                                  | Claim                                    | Effet externe             | Transaction/publication                                | Reprise/expiration                      |
| ------------------------------------ | -------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------- | ------------------------------------------------------ | --------------------------------------- |
| PASSWORD_RESET_NOTIFICATION_DELIVERY | SecurityEvent C1 SUCCEEDED + reset/outbox/job                                                      | unicité outbox+action                    | notification              | Audit SYSTEM v3 après preuve source                    | reprise bornée, source invalide refusée |
| INVITATION_NOTIFICATION_DELIVERY     | Audit v3 SUCCESS create invitation + outbox/job                                                    | unicité outbox+action                    | e-mail invitation         | Audit SYSTEM v3, délégant=acteur causal                | aucune source historique/REJECTED       |
| EXPORT_BUILD                         | Audit v3 SUCCESS create export + export/job/attempt                                                | CAS lease+fence                          | ZIP signé, upload staging | CAS READY+métadonnées+Audit unique                     | reconcile crash/COMMIT inconnu          |
| EXPORT_EXPIRY                        | READY+génération+expiresAt                                                                         | CAS READY->EXPIRED                       | suppression différée      | état+Audit SYSTEM v3                                   | attend leases lecture, nettoyage ciblé  |
| RECOVERY_CASE_CANCELLATION           | create : nouveau case causal distinct du case annulé ; rôle/statut : acteur causal = sujet du case | verrou/état dans transaction initiatrice | aucun effet externe       | cancel+Audit SYSTEM v3 avant réponse, même transaction | exactement un audit par case annulé     |
| RECOVERY_CASE_EXPIRATION             | PENDING+génération+expiresAt                                                                       | CAS PENDING->EXPIRED                     | aucun effet externe       | expire+Audit SYSTEM v3                                 | reprise CAS, pas de délégant            |
| ADMIN_BOOTSTRAP                      | garde singleton + admin id                                                                         | claim singleton                          | secret via canal contrôlé | création+garde+Audit SYSTEM v3                         | aucune double création/audit            |

`EXPORT_BUILD` publie READY avec `SUCCESS/null`. Les reprises non terminales
n'écrivent aucun AuditLog. Trois tentatives incluent l'initiale : une erreur
transitoire connue planifie `nextAttemptAt` à +30 s puis +120 s par CAS ; un
crash devient réclamable à l'expiration de lease seulement avant la deadline ;
tout claim prématuré, stale ou concurrent du watchdog est refusé. Une erreur
non retryable ou un troisième échec avant deadline ferme FAILED avec audit
unique.
Le claim fixe une deadline de tentative immuable à +600 s ; renew et CAS
READY/FAILED exigent fence, propriétaire et lease actifs, aucun retry planifié
et `now < deadline`. La planification révoque propriétaire/lease immédiatement.
À ou après la deadline, y compris si lease et deadline coïncident, le watchdog
est prioritaire : lui seul planifie la reprise avec backoff ou ferme le
troisième essai avec `RETRY_BUDGET_EXHAUSTED` et audit unique.
Un PUT stale déjà parti peut finir sur sa clé staging immuable, jamais publier,
et devient un orphelin ciblé. Le terminal FAILED lie dans une seule transaction
CAS l'état, son code fermé et un audit v3 `REJECTED` unique; une perte
d'acquittement relit READY, FAILED, PROCESSING au même fence ou un fence/
génération devenu obsolète avant toute action. Le PROCESSING au même fence ne
reprend le CAS terminal que si owner, lease, absence de retry planifié et
deadline le rendent encore éligible ; sinon il suit scheduler, reclaim ou
watchdog sans publication. Le worker obsolète s'arrête sans
mutation et sans toucher l'objet courant. Les codes v3 de rejet proviennent exclusivement de
`failureCodeByTrigger`; les sinks SecurityEvent/NONE n'écrivent pas de v3.
Les sources déléguées lient l'`entityId` causal à la ressource ou au sujet du
case. L'annulation issue de create/role/status est un effet transactionnel,
jamais une continuation asynchrone. Le téléchargement n'entre dans `BEGIN_STREAM` qu'après l'audit de
début confirmé.

R4 conserve 60 chemins et 67 opérations, porte le compteur à 141 schémas et
ne modifie ni runtime, Prisma, migration, rôle, dépendance, workflow ou
provider. C2a/C2b et C3 restent non commencés.

## R6 — frontière transactionnelle BEGIN/callback/ROLLBACK/COMMIT/release

La politique `transactionClientDisposal` s'applique à tout futur writer C2,
qu'il soit appelé par HTTP, bootstrap, outbox, job ou transition SYSTEM. Elle
ne constitue pas une implémentation runtime.

La séquence autorisée est fermée : `BEGIN`, callback, puis soit rollback avant
release après échec pré-COMMIT, soit COMMIT après succès du callback. `BEGIN`
est borné à 2 000 ms et doit être confirmé avant le callback ; rejet explicite
avec `ReadyForQuery=I` post-commande sur le même client permet seul une release
réutilisable, tandis que deadline/perte/accusé inconnu impose un discard unique.
Le rollback dispose de la même borne monotone. Seule une confirmation avant la
borne, suivie du `ReadyForQuery=I` causal post-rollback sur le même client et
d'un client utilisable, autorise une release réutilisable unique. `T`, `E`,
état inconnu, rejet, suspension ou perte de connexion imposent le discard de la
connexion physique exactement une fois. Une terminaison tardive reste observée
mais ne peut ni rendre le client réutilisable ni déclencher une seconde release.

L'erreur primaire et les erreurs ou issues terminales de `BEGIN`/rollback
restent distinctes. Le 503 public est neutre, sans fuite, retry de transaction
ou second sink. La tentative de COMMIT est marquée avant l'appel driver et son
accusé est borné à 2 000 ms. Perte, deadline ou accusé inconnu après ce point
est exclusivement `COMMIT_UNKNOWN`, détruit le client exactement une fois,
n'exécute aucun rollback, n'en affirme aucun et interdit tout replay de
mutation. Un settle tardif ne reclassifie ni ne produit réponse, release ou
replay. La réconciliation de l'état durable précède toute continuation.

Cette dernière règle ne change pas les reprises export existantes : scheduler,
reclaim, watchdog, lease, fencing et budget peuvent autoriser une nouvelle
tentative de machine d'état, jamais le rejeu d'une mutation au résultat inconnu.
Les six traces normatives — rollback confirmé, rollback rejeté, rollback
suspendu, connexion perdue, COMMIT confirmé et COMMIT inconnu — sont générées
depuis OpenAPI et soumises aux mutations adversariales R6.

## C2a — fondations runtime locales

Le mandat C2a matérialise seulement le modèle physique, la migration,
l’exécuteur transactionnel R6, les quatre identités PostgreSQL, leur matrice
ACL, la configuration désactivée par défaut et les validateurs. Les onze
opérations HTTP C2a, leurs workers métier et le bootstrap exécutable restent
**NON IMPLÉMENTÉS**. C2b, C3 et tous les fournisseurs restent hors périmètre.

### Modèle et causalité

La migration `admin_security_c2a_runtime` préserve AuditLog v1/v2 et ajoute les
écritures v3 explicites. Elle matérialise les demandes PASSWORD_RESET et leur
contexte dédié, les recovery cases, invitations, outboxes chiffrés, snapshots,
items, garde singleton et idempotence. Les contraintes différées exigent dans
un même commit :

- événement LOGIN + demande reset + outbox PASSWORD_RESET ;
- AuditLog v3 `createAdminInvitation` + invitation + outbox INVITATION ;
- expiration du recovery case + AuditLog SYSTEM exact ;
- acceptation + utilisateur PENDING_MFA + préauth dix minutes + événement lié
  BUSINESS au même utilisateur et à la même invitation, avec marqueur `xid8`
  posé uniquement par le trigger d'INSERT de l'utilisateur dans la transaction
  courante, immuable sous UPDATE, et invitation non expirée ;
- bootstrap + premier SUPER_ADMIN PENDING_MFA + garde singleton + audit.

La consommation du contexte reset et l'approbation d'un recovery case sont
également refusées après expiration. Les côtés événement/audit et état métier
portent chacun un trigger différé : un événement reset ou d'acceptation, un
audit d'invitation ou une annulation isolés ne peuvent donc pas committer seuls.

Un remplacement lie l’ancien objet et son outbox : même utilisateur pour le
reset, même e-mail ASCII canonique pour l’invitation, ancien objet terminalisé,
ancien outbox annulé et nouveaux `replaced*Id` cohérents. Le pliage e-mail est
un `translate(A-Z,a-z)` ASCII déterministe, identique pour le preflight login,
l’unicité et l’acceptation. Une annulation de recovery case causée par la
création d’un nouveau case exige deux cases distincts portant le même sujet.

### Exécuteur transactionnel R6

Les budgets sont verrouillés à acquisition 2 000 ms, BEGIN 2 000 ms, callback
5 000 ms, rollback 2 000 ms, accusé COMMIT 2 000 ms et grâce terminale 500 ms
non renouvelable. Le callback reçoit un signal d’abandon et une file de
requêtes sérialisée ; l’observation `ReadyForQuery` n’est armée que lorsque la
commande devient active sur le client acquis. Les commandes `BEGIN`,
`COMMIT`, `ROLLBACK`, `START TRANSACTION`, savepoints et variantes terminales
sont interdites dans le SQL callback, y compris `PREPARE TRANSACTION`,
`SET TRANSACTION` et `SET SESSION CHARACTERISTICS AS TRANSACTION`. Un
`PREPARE name AS ...` SQL ordinaire reste distinct et autorisé.

Le runtime vérifie `pg@8.22.0`, `pg-pool@3.14.0`, le code interne qualifié et
`getTransactionStatus()`. BEGIN/ROLLBACK/COMMIT exigent aussi le
`QueryResult.command` correspondant. Une réponse serveur `ROLLBACK` à COMMIT
est un rejet explicite, jamais un succès. Une issue inconnue après tentative de
COMMIT interdit rollback et replay. Toute requête en vol, état `T`/`E`/inconnu,
perte transport ou deadline détruit le client une seule fois et attend au plus
la grâce terminale pour fermeture/quiescence.

### Identités et ACL

Le reader et le writer C1 ne sont pas élargis. Les rôles
`kora_admin_c2a_writer`, `kora_admin_c2a_notification_worker`,
`kora_admin_c2a_expiration_worker` et `kora_admin_c2a_bootstrap` ont des secrets
et pools séparés. Le provisionneur compare par différence symétrique `EXCEPT
ALL` une matrice littérale de colonnes et relations ; l’attestation applicative
compare la même séquence exacte dans la transaction. Namespace, multiplicité
et grantor propriétaire font partie de l'identité de chaque ACL. Le
provisionneur refuse tout grant colonne ou relation hors `public`, depuis un
grantor non propriétaire ou sur une relation homonyme. Elle couvre aussi CONNECT/USAGE,
membership, ownership, attributs/configuration, grant options, routines,
types, large objects, paramètres, default ACL et `PUBLIC`.

Les enums des tables partagées de snapshot et d'idempotence incluent des
opérations réservées à C2b. C2a ne crée ni rôle ni donnée C2b. Une politique
RLS qualifiée ou une séparation physique est un gate bloquant avant C2b.

Le worker notification ne lit les sources causales qu’au travers de deux vues
`security_barrier`. Les producteurs ont seulement les colonnes d’INSERT sur
les sinks et aucun `RETURNING`. L’expiration et le bootstrap ont chacun leur
identité dédiée. Toute configuration absente laisse C1 utilisable et C2a
désactivé.

### Validation et limite de publication

Le validateur exécute migration vide et upgrade C1 réaliste, projection
A/B, collision e-mail sans mutation partielle, provisioning idempotent,
contaminations refusées, tests positifs/négatifs par rôle, causalité,
remplacements et exécuteur réel avec pool `max=1`. Le wrapper Docker utilise
un digest PostgreSQL 18.4, un réseau et des noms uniques, `tmpfs`, sept secrets
éphémères distincts et compare l’inventaire complet avant/après.

La campagne réelle finale passe l'ensemble de ces preuves, atteint la
quiescence, supprime uniquement ses ressources et restaure l'inventaire
étranger observé. Le warning de sérialisation de trois requêtes sur un même
client `pg@8.22.0` est une réserve de compatibilité pg 9, pas un échec de
l'exécuteur R6.

Le premier gate OpenAPI, bloqué par l'ancienne liste exacte de 39 modèles,
reste un NON-PASS historique. L'avenant ciblé protège maintenant exactement ces
39 modèles historiques et les neuf modèles C2a, soit 48 au total, sans déduire
la référence du schéma contrôlé. La reprise OpenAPI passe à 60 chemins,
67 opérations et 141 schémas ; suppression, renommage, ajout et substitution à
cardinalité constante sont couverts par des régressions adversariales. Un
premier candidat qui ignorait un modèle supplémentaire indenté reste NON-PASS
de contre-revue ; l'extracteur final accepte les espaces ou tabulations avant
`model` et la régression dédiée verrouille ce contournement.

Ces fondations restent locales, non indexées, non commitées et non publiées au
présent gel. Aucun endpoint, worker métier, SDK fournisseur, appel HIBP,
notification, stockage d’export, Ready, merge, tag, release ou déploiement n’en
est déduit.

## C2a métier P0 — preuves transactionnelles et isolation des capacités

Le sous-lot P0 du plan métier ne monte encore aucune opération HTTP, aucun
worker et aucun bootstrap exécutable. Il ferme uniquement deux préconditions
techniques :

- le writer C2a lit `AdminSession.accessTokenJti`, `stepUpPurpose` et
  `stepUpExpiresAt`, sans `SELECT *` et sans accès à `stepUpVerifiedAt`,
  `refreshTokenHash`, `tokenFamilyId`, `lastActivityAt` ou `createdAt` ;
- chaque processus choisit exactement un profil `HTTP`, `NOTIFICATION`,
  `EXPIRATION` ou `BOOTSTRAP`, charge un seul credential/pool C2a et n’expose
  aucun sélecteur public de rôle. Le mode désactivé ne crée aucun pool C2a et
  préserve le démarrage C1.

La campagne PostgreSQL isolée qualifie la migration fraîche et l’upgrade, la
préservation historique, le provisioning idempotent, les quatre identités, les
ACL positives/négatives, le refus des contaminations et memberships, la
non-régression C1 et l’exécuteur R6 réel. Les deux suites PostgreSQL passent
33/33 ; stderr est vide. Les trois lectures notification du validateur sont
désormais séquentielles et le warning `pg@8.22.0` n’apparaît plus sur ce parcours
précis. Cette observation ne qualifie pas le driver en général et n’autorise
aucune montée de version.

La capacité Docker étrangère observée — quatre conteneurs, cinq volumes, cinq
réseaux et quatre images — est préservée après suppression du seul conteneur et
du seul réseau éphémères de la campagne. Les adaptateurs de production et les
huit arbitrages métier restent non activés ; leur annexe hors dépôt est une
proposition. P1–P9, C2b et C3 ne sont pas commencés.

## C2a métier P1–P9 — runtime local qualifié — 2026-10-16

Cette section supplante uniquement l'état d'avancement P1–P9 des sections
historiques précédentes. Les arbitrages A1–A8 ont été autorisés par le mandat
CTO P1–P9 puis matérialisés sans modifier le schéma, la migration, les ADR,
l'OpenAPI, le contrat généré, les dépendances, les lockfiles, les workflows ou
l'exécuteur transactionnel R6 qualifié.

Le profil `HTTP` monte ensemble les onze opérations C2a :
`requestAdminPasswordReset`, `resetAdminPassword`,
`createAdminRecoveryCase`, `listAdminRecoveryCases`,
`getAdminRecoveryCase`, `approveAdminRecoveryCase`,
`createAdminInvitation`, `acceptAdminInvitation`, `listAdminUsers`,
`changeAdminUserRole` et `changeAdminUserStatus`. C1 reste monté lorsque C2a
est désactivé et les quatre opérations C2b ne sont pas montées. Les huit corps
JSON POST mal formés sont normalisés avant contrôleur sans modifier les
frontières C1.

Les profils `NOTIFICATION`, `EXPIRATION` et `BOOTSTRAP` restent séparés. La
notification conserve PostgreSQL comme source de vérité, une référence
fournisseur stable par livraison logique, les leases/fences et l'état
`DELIVERY_UNCERTAIN` sans retry aveugle après début d'envoi. L'expiration
utilise un scan de 60 secondes, des lots de 100 et invalide la readiness après
180 secondes sans scan complet réussi. Le bootstrap lit un unique JSON UTF-8
borné sur stdin, n'accepte aucun secret en argv et distingue succès, entrée
invalide, garde déjà consommée, dépendance indisponible et `COMMIT_UNKNOWN`.

Les producteurs fail-closed refusent la mutation avant consommation de
contexte ou création d'outbox lorsque la notification ou la clé requise manque,
tout en conservant le sink exigé au stade de preuve. HIBP et Argon2id restent
hors callback SQL ; aucun mot de passe, hash, préfixe, suffixe ou corps HIBP
n'est journalisé. Les adaptateurs déterministes sont explicitement de test et
émettent `PROVIDER_ACCEPTED_FOR_TEST` ; aucun fournisseur, keyring ou HIBP de
production n'est qualifié.

La campagne réelle isolée compte 8 contrôles réussis : 1 contrôle statique et
7 scénarios réels PostgreSQL/Redis/HTTP. Elle confirme onze opérations, cinq
idempotences, deux snapshots, huit erreurs JSON, notification, expiration,
bootstrap, concurrence, erreurs et sinks, avec non-régression C1. Quatre
corrections causales ont été verrouillées : l'INSERT
`AuditLog` respecte l'ACL sans nommer `bootstrapGuardId`, l'échéance
d'idempotence exacte est dérivée de l'horloge murale PostgreSQL
`clock_timestamp()` capturée dans la transaction après le verrou et
les erreurs de domaine enveloppées par l'exécuteur conservent leur statut sans
affaiblir `COMMIT_UNKNOWN`. Enfin, un refus post-preuve n'est plus levé dans le
callback R6 après son INSERT : le callback retourne une rejection typée, R6
confirme le COMMIT de l'audit, puis le service lève l'erreur HTTP durable. La
branche `COMMIT_UNKNOWN` reste sans second sink. Les ressources Docker isolées
ont été supprimées et l'inventaire étranger observé est préservé.

Le parcours réel utilise `pg@8.22.0` avec succès. Cette preuve borne la réserve
au chemin exécuté ; elle ne qualifie pas le driver globalement ni une panne
réseau distribuée. C2b/C3, fournisseurs de production, politique OSS,
publication et déploiement restent hors périmètre.

## C2a R1 — fenêtre d'idempotence C-05 — 2026-10-18

Les cinq mutations idempotentes utilisent désormais exclusivement l'horloge
murale PostgreSQL `clock_timestamp()`, capturée une fois dans une CTE
matérialisée après le verrou, pour une fenêtre demi-ouverte exacte de 24 heures :
une génération est active tant que `database_now < expires_at`, et la même clé
est réutilisable à la borne ou après celle-ci. Une contrainte d'unicité conserve chaque
génération historique et un verrou advisory sérialise l'allocation de la
génération suivante. Un appel ancien ne peut donc ni réserver durablement la
clé ni écraser le résultat d'une génération plus récente.

Le lookup, la mutation métier, le sink d'audit et l'enregistrement idempotent
restent dans la même transaction R6. Même payload et payload différent,
concurrence, rollback et `COMMIT_UNKNOWN` ont été exercés sur PostgreSQL réel.
La campagne Foundations passe 34/34. La campagne métier cumulative compte
12 contrôles réussis : 1 contrôle statique et 11 scénarios réels
PostgreSQL/Redis/HTTP. La non-régression C1 passe 47/47. Les ressources isolées
ont été nettoyées sans mutation de l'inventaire Docker étranger observé.

Sous Windows, le stop par canal de preuve démontre la quiescence des processus,
mais la livraison d'un signal OS termine le processus sans permettre
d'observer le handler gracieux. Cette limite de plateforme reste explicite et
n'est pas présentée comme une preuve POSIX. Fournisseurs de production,
qualification globale de `pg@8.22.0`, C2b/C3, politique OSS et publication
restent hors périmètre.

## Raccordement CI C2a — instantané prépublication — 2026-10-18

Le workflow Infrastructure génère explicitement le client Prisma après
`npm ci`, conserve le gate C1, puis exécute séparément les validateurs
Foundations PostgreSQL et métier PostgreSQL/Redis/HTTP avant Compose, lifecycle
et santé API. Chaque wrapper conserve ses ressources isolées, ses secrets et
ports éphémères, sa propagation d'échec et son nettoyage ciblé.

Les preuves locales qualifiées restent distinctes : l'historique P1–P9 compte
8 contrôles réussis — 1 contrôle statique et 7 scénarios réels — tandis que le
gel final compte 12 contrôles réussis — 1 contrôle statique et 11 scénarios
réels. Les 61 skips conditionnels restent 11 C2a, 46 C1 et 4 Foundations-P0 ;
ils ne sont pas transformés en PASS. À cet instant, les exécutions Linux et CI
de ces deux nouveaux steps sont **EN ATTENTE**. L'arrêt gracieux par signal OS
Windows/POSIX reste **NON DEMONSTRATED** ; les fournisseurs de production
restent **NON QUALIFIÉS** et `pg@8.22.0` n'est qualifié que sur les chemins
effectivement exercés. C2b/C3 ne sont pas commencés et la politique OSS reste
différée.
