# Rapport de validation locale S1.2-03C1 — Admin Auth Session Runtime

Statut : **BASELINE C1 PUBLIÉE DANS LA DRAFT PR #50 — INSTANTANÉ R1
PRÉPUBLICATION VALIDÉ LOCALEMENT — ÉCHEC INFRASTRUCTURE HISTORIQUE PRÉSERVÉ —
FOURNISSEUR DE CLÉS DE PRODUCTION NON QUALIFIÉ — C2/C3 NOT STARTED**

Date : 2026-10-03

## Périmètre et préflight

La validation porte sur le worktree
`C:\Users\moham\AppData\Local\Temp\KORA-PLUS-S1-2-03C1`, branche
`feat/s1-2-03c1-admin-auth-session-runtime`, au HEAD
`c97992ca2c82bc4f22f9222ea98ed53714fede4c` et à l'arbre
`c8a6d52e7dcfdd24b5b9d0caee14363fa8220869`.

Le préflight a confirmé `origin/main` local et distant au même merge, la branche
locale `main` historique à `a602fd38f32d018867c8a058deace0325b4a7c31`, la
branche 03B locale/upstream/distante à
`cd91a158f6223390a05feecf4b28ea4aca56f781`, dix worktrees préservés, aucun
upstream/commit/remote/PR C1 et un index vide. La PR #48 est restée fusionnée,
fermée et non Draft ; son corps a conservé l'empreinte
`27de6246da0dfa178dfd19e9d128bd4d6d0f48f23b4ca53ed7c4ac8f26a76708`.
Les quatre runs push/main attendus sont restés `completed/success`, tentative 1,
sur le merge exact : Infrastructure `36991329968`, Launcher Windows
`36991329948`, Security `36991329957` et Quality Linux `36991330060`. Le run
Dependabot dynamique `36991463317` est resté distinct.

Le préflight du complément Infrastructure a ensuite reproduit les 78 chemins
C1 autorisés, dont 52 suivis modifiés et 26 nouveaux, avec index vide. Le
manifeste d'entrée comptait 8 491 octets et portait l'empreinte
`3831d93868e61ea1e293daa3191a17b9e5086dc77ca0fd182de3eedfaf569c1d` ;
le lockfile était déjà à
`51a4a23fe87cbf7b441e464b2b066e501f8f66748d355077a3241ee4933f6b37`.

Le gel contractuel préalable a été reproduit avant écriture : quatorze fichiers,
`+1388/-126`, manifeste de 1 514 octets, agrégat
`76fff49293dc5636a31653af6853df4c66a0e0af75bbee5d30ee81382e0b6bec` et
lockfile
`3bbb2e4b476decf50a7165143c985719d234e9511deebf757a6c9527eb68c03a`.

## Résultat fonctionnel

Le module C1 expose et exerce exactement les douze opérations autorisées :

| Opération                      | Preuve principale                                               |
| ------------------------------ | --------------------------------------------------------------- |
| `loginAdmin`                   | password réel/dummy, statut, préauth, rate limit et anti-oracle |
| `createAdminTotpEnrollment`    | contexte lié, XOR, idempotence sans redélivrance                |
| `deliverAdminTotpEnrollmentQr` | PNG serveur one-shot et rollback sur panne QR                   |
| `confirmAdminTotpEnrollment`   | TOTP, dix codes, session et audit dans un COMMIT                |
| `verifyAdminTotp`              | compteur global strict et rejeu inter-opérations refusé         |
| `verifyAdminRecoveryCode`      | binding, expiration et consommation unique                      |
| `rotateAdminRecoveryCodes`     | TOTP inline, batch/idempotence/audit atomiques                  |
| `stepUpAdminSession`           | purpose lié, fenêtre cinq minutes, statut/version rechargés     |
| `refreshAdminSession`          | gagnant unique, replay et révocation durable de famille         |
| `revokeCurrentAdminSession`    | révocation immédiate de la session courante                     |
| `listAdminSessions`            | acteur/role/version/famille revalidés à la lecture              |
| `revokeAdminSession`           | step-up et binding acteur/cible avant révocation                |

La surface reste à 60 chemins, 67 opérations et 137 schémas, avec C1=12,
C2=15 et C3=0. Les retraits `SUPPORT`, le profil JCS/JWS Ed25519 R4 et les
garanties C2 sont préservés. Aucun bootstrap, reset, invitation, gestion C2,
export d'audit ou écran C3 n'a été ajouté.

## Stockage, migration et ACL

La migration unique
`20261002170022_admin_auth_session_runtime/migration.sql` ajoute six modèles.
Le gate PostgreSQL a validé :

- upgrade A depuis les deux migrations historiques, fixture AuditLog legacy
  conservée en version 1 sans DML ni métadonnée inventée ;
- construction B depuis une base vide ;
- 39 modèles, 40 tables avec `_prisma_migrations` et trois migrations ;
- projections A/B identiques, empreinte de catalogue
  `5b2bf03fbe7fc292ff48102e7bbdd66f63a2b0a62b698e350f8122575ab88120` ;
- douze refus SQL ciblés pour les contraintes, transitions et immutabilités ;
- dix codes recovery vérifiés à `COMMIT`, chaîne refresh génération +1,
  compteur TOTP croissant et audit v2 append-only ;
- quatre passages idempotents du provisionneur et nettoyage des deux bases ;
- refus préflight du writer contaminé avant mutation, avec signature inchangée
  des ACL, attributs, memberships, réglages et empreintes non divulguées des
  deux credentials ;
- injections hostiles réelles sur grant de colonne `PUBLIC`, provenance
  `CONNECT`/`USAGE`, fonction large-object, grant option et schéma tiers, toutes
  refusées puis supprimées de manière ciblée.

Le lecteur a seulement `SELECT` sur `Customer(id)`, la projection C1 de
`AdminUser` et la projection C1 de `AdminSession`. Le writer a seulement les
colonnes C1 nommées sur l'utilisateur, les sessions, les codes, les contextes,
les six tables C1 et l'idempotence. Les deux sinks sont `INSERT`-only, sans
`RETURNING`, `SELECT`, `UPDATE` ni `DELETE`. Aucun pool n'utilise le propriétaire
ou migrateur ; les identités lecteur/writer sont distinctes et attestées avant
`application.init()`.

## HTTP, concurrence, pannes et cryptographie

Le harness isolé a utilisé PostgreSQL 18.4 et Redis 7.2.15 réels, une persistance
AOF, des rôles/secrets/ports aléatoires et des clés RSA/enveloppe éphémères
réelles. Résultat final : une suite, 18 tests sur 18, douze opérations HTTP,
catalogue/ACL/migrations inclus. Il a notamment prouvé le double TOTP, la double
consommation recovery, le refresh concurrent, le plafond de trois familles,
l'invalidation statut/rôle/version/révocation, le rewrap AES-GCM vers la clé
active, les contrôles transport, les pannes PostgreSQL/Redis/provider/signature/
QR/audit et le `COMMIT` à résultat inconnu sans retry aveugle.

Le test Redis réel a observé 10 succès sur 11 requêtes concurrentes pour la
limite, `WAITAOF` sur la même connexion et la conservation du compteur après
redémarrage AOF. Toutes les ressources de ce harness ont été supprimées de
façon ciblée : conteneurs PostgreSQL/Redis, volume Redis, base E2E et répertoire
de secrets.

Le profil crypto vérifié est TOTP SHA-256 six chiffres/30 secondes/±1,
AES-256-GCM avec AAD et enveloppement, refresh 256 bits, Argon2id 64 MiB/t3/p1
et JWT RS256 15 minutes maximum. Les tests Jest utilisent le vrai `jwtVerify`.
Le JavaScript compilé a émis/vérifié un JWT avec JOSE réel et rejeté une
signature altérée ; algorithme, issuer, audience et expiration incorrects sont
également refusés.

## Observation anti-oracle

Après warmup, l'ordre a été randomisé et huit mesures réelles ont été prises par
cas. Les médianes finales en millisecondes étaient : contrôle bruit mauvais
password `171.095`, inconnu `175.158`, disabled `173.817`, suspended `176.662`
et mauvais password mesuré `179.331`. Les intervalles bootstrap 95 % de médiane
étaient respectivement `[159.260,189.978]`, `[159.130,192.677]`,
`[163.795,195.432]`, `[158.107,190.672]` et `[173.465,187.733]`.

Les Cliff's delta contre le contrôle bruit étaient `0`, `0.125`, `0.28125`,
`0.15625` et `0.34375`. Ces observations montrent des travaux comparables dans
ce harness, mais ne démontrent pas l'absence absolue d'oracle et ne reposent sur
aucun seuil arbitraire ou simple p-value.

## Gates applicatifs, contrat et supply-chain

- Prisma validate et generate : PASS.
- API : format, lint, typecheck et build PASS ; 17 suites PASS, 79 tests PASS,
  17 tests conditionnels skipped, 96 total.
- Gate intégré PostgreSQL/Redis/HTTP : 18/18 PASS sur dépendances réelles.
- OpenAPI : 60 chemins, 67 opérations, 137 schémas, 18 invariants hérités et
  39 modèles cibles PASS ; génération exacte courante, SHA-256 du généré
  `d53665d89388e399d1a7dbf782739b836bb652d8cfd281e3679621c86377b697`.
- Contracts : format, lint, typecheck, tests et build PASS ; boundary 7/7 PASS.
- Outillage : 403/403 PASS ; politique CI locale : quatre workflows/quatre
  actions pinées PASS.
- Scanner officiel avec historique : 384 fichiers, historique activé, 52
  fichiers immuables et six scripts d'installation qualifiés PASS.
- Deux `npm ci --include=dev --no-fund` ont installé 1 146 paquets ; le lockfile
  est resté à
  `51a4a23fe87cbf7b441e464b2b066e501f8f66748d355077a3241ee4933f6b37` et
  le prebuild Argon2 natif a hashé/vérifié à 64 MiB/t3/p1 après chaque passage.
- `npm ls --all` et `npm explain` : exit 0 ; pins directes `jose@6.2.12`,
  `argon2@0.45.1`, `qrcode@1.5.4`, `@types/qrcode@1.5.6` et
  `@types/node@22.18.13` préservé.
- Audits npm bruts complet et production : code 0, zéro vulnérabilité. Les
  1 138 signatures de registre et 201 attestations sont vérifiées sur le graphe
  final aliasé.
- Licences : 1 140 paquets, zéro licence non déclarée et zéro licence refusée ;
  l'alias résout physiquement vers `tinyglobby@0.2.17` MIT.
- Web, Admin et UI : lint, typecheck et build PASS. Le gate permanent charge
  ESLint et le plugin réels depuis chaque cwd, refuse tout
  `settings.next.rootDir`, et vérifie les diagnostics positif/négatif des règles
  Next témoins.
- Infrastructure : `infra:verify` et `infra:verify-api` PASS, code 0, sur le
  projet jetable `kora-plus-c1-infra-gates-20261003`, ports loopback
  `25432/26379/23102`, secrets, réseau et volumes dédiés. Le cycle a couvert
  migrations/provisionnement depuis des volumes vides, restart persistant,
  reset destructif ciblé, reprovisionnement, idempotence, refus de l'identité
  propriétaire, acceptation runtime, même PID API, pannes/récupérations Redis et
  PostgreSQL, réponses/logs sans secret ni DSN, puis nettoyage complet.

Les paquets WASM optionnels historiques observés comme extraneous restent la
qualification séparée déjà documentée ; `npm ls --all` termine à zéro et aucun
nouveau nœud invalid, peer cassé ou drift causal n'est accepté.

## Incidents et contrôles non exécutés

Les contre-revues du premier gel, désormais obsolète, ont identifié puis fait
corriger des frontières substantielles : CSRF calculé après `COMMIT`, sinks
d'échec incomplets, statuts HTTP hors contrat, parser de justification partiel,
rate limit Redis après une écriture PostgreSQL, effacement TOTP sans `finally`,
attestation writer incomplète sur `PUBLIC`/large objects et ordre de verrouillage
non matérialisé. Ces corrections ont invalidé ce gel et ses conclusions.

Le parcours de révocations croisées ajouté ensuite a exposé un deadlock réel lié
à la FK AuditLog vers les utilisateurs. Le runtime verrouille maintenant tous
les utilisateurs puis toutes les sessions concernés, triés par identifiant. Un
premier rerun intégré après durcissement ACL a échoué uniquement sur deux
fixtures invalides (`text[]` contre `uuid[]` et mauvaise signature de
`lo_create`) ; un second a exposé le deadlock. Ces passages sont déclarés non
conclusifs, leurs ressources ont été nettoyées, puis le rerun corrigé a réussi
PostgreSQL A/B, ACL et 18/18 scénarios HTTP réels.

Avant ces revues, `AdminUser_c1_transitions` bloquait le rewrap d'enveloppe
après TOTP valide et la preuve `COMMIT` inconnu était injectée sur un parcours
sans écriture. L'exception SQL a été bornée au rewrap accompagné d'un compteur
strictement croissant et la preuve a été déplacée sur login/transaction writer.
Un autre passage avait dépassé le timeout Jest de 180 secondes sans réduction
Argon2 ; seul le budget de la suite réelle est passé à 300 secondes. Une commande
lint/typecheck avait utilisé le nom inexistant `@kora/api` et n'avait lancé aucun
contrôle ; la commande exacte `@kora-plus/api` a ensuite réussi. Enfin, le smoke
Argon2 contrôle désormais sémantiquement les paramètres PHC, indépendamment de
leur ordre textuel.

Le dernier gate supply-chain avait découvert `GHSA-vfj7-8cjw-p6xm` dans la
chaîne dev-only unique
`eslint-config-next@16.3.8 → @next/eslint-plugin-next@16.3.8 → fast-glob@3.3.1 → micromatch@4.0.8 → braces@3.0.3`.
L'avis couvre toujours toutes les versions publiées de `braces` jusqu'à
`3.0.3`, sans release corrigée. La remédiation autorisée conserve Next,
eslint-config-next et le plugin à `16.3.8`, et remplace uniquement l'import
`fast-glob` de ce plugin par `npm:tinyglobby@0.2.17`. Le lock final ne contient
plus aucun chemin physique vers `braces`, `micromatch` ou le véritable
`fast-glob`; `fdir@6.5.0` et `picomatch@4.0.4` sont réutilisés, tandis que les
nœuds devenus orphelins de l'ancienne chaîne sont supprimés.

Cette substitution n'est pas qualifiée en présence de `settings.next.rootDir` :
`tinyglobby` développe par défaut un répertoire littéral, contrairement au
comportement attendu ici de `fast-glob`. Les configurations statiques et
effectives Web, Admin et UI n'utilisent pas cette propriété. Le gate
`security:next-root-dirs`, exécuté après installation et avant audit, refuse
explicitement un littéral, un slash final, un tableau, un motif avec braces,
un mauvais parent/version/alias et une règle Next témoin supprimée ou
désactivée. Toute future utilisation de `settings.next.rootDir` exige une
nouvelle qualification ; aucune compatibilité générale n'est revendiquée.

Le lock conserve exactement les versions, URLs et intégrités de tous les nœuds
communs avec le graphe antérieur. Sa projection production a gardé l'empreinte
`5d776432c8dd33743ef8b86bd9ef1f16fa55c85f9d61f24ca5cff39ca600fac7`.
L'empreinte des 57 fichiers runtime, schéma, migration et contrats est restée
`7469ff5d71c25b7ffa9a48404d5baa413684e4763ab5518d65a788662cd7c830` ;
les preuves longues PostgreSQL A/B et HTTP/Redis restent donc applicables.

L'inventaire préalable a confirmé deux conteneurs `kora-plus-local` actifs sur
`15432/16379`, leurs volumes et leur réseau, ainsi que deux conteneurs
historiques arrêtés, trois autres volumes et quatre images. Les scripts
historiques utilisaient initialement les noms explicites `kora-plus-local-*` :
leur exécution aurait ciblé les ressources préexistantes malgré `-p`. Ils ont
été rendus opt-in isolables sans changer les valeurs par défaut : instance
validée, projet/volumes/réseau/répertoire de secrets dérivés, ports dédiés,
liaison des secrets vérifiée et compatibilité du literal lifecycle limitée au
mode éphémère explicitement activé.

Le premier démarrage réellement vide a révélé l'ordre incorrect : le
provisionneur demandait `public.Customer` avant les migrations. `infra:up`
applique désormais les migrations sous le propriétaire/migrateur avant de
provisionner les frontières reader/writer ; le reset rejoue le même ordre. La
première tentative API a ensuite refusé un artefact Prisma absent, corrigé par
le prebuild/build API autorisé ; la suivante a révélé cinq variables runtime C1
manquantes dans le harness, complétées avec le Redis isolé. Ces trois passages
sont des échecs diagnostiques, jamais des PASS. Seules les relances terminales
au code 0 sont retenues.

Après les deux gates réussis, seuls les conteneurs, le réseau, les deux volumes
et le répertoire de secrets de l'instance jetable ont été supprimés. Le
postflight retrouve exactement les quatre conteneurs, cinq volumes, cinq
réseaux et quatre images préexistants ; les IDs `f64c70cf…` et `b78fb675…`
restent actifs et sains sur `15432/16379`, tandis que les trois ports jetables
ne sont plus écoutés.

Flutter/APK, iOS et navigateur C3 sont `NON EXÉCUTÉS`, conformément au périmètre
de cette remédiation dev-only. Aucun audit réseau interrompu n'est compté comme
succès.

## Limites et publication

**C1 production / KMS externe / signature de production : NON QUALIFIÉS.** Le
provider de production est indisponible par défaut et ferme les routes C1 au
503 contractuel. Le choix cloud, SDK, compte et coût reste une décision Produit
et déploiement distincte.

Aucun `git add`, commit, push, changement de PR, rerun GitHub, tag, release ou
déploiement n'a été effectué. C2 et C3 restent `Not started`. Le fournisseur de
clés de production reste explicitement non qualifié ; aucune validation locale
ne vaut décision de publication ou de déploiement.

## Instantané local prépublication S1.2-03C1-R1 — invocation Linux du provisionneur

Les sections précédentes constituent la preuve historique locale antérieure à
la publication. La baseline C1 a ensuite été publiée au commit unique
`72f2192c912e9f626cb6a69bbc542ebd7e00d31e`, parent
`c97992ca2c82bc4f22f9222ea98ed53714fede4c`, arbre
`272fa9c79ec9faba1ae34c4e649be62881fea208`, dans la Draft PR #50. Son gel
reconstruit depuis les blobs Git contient 78 chemins, 8 491 octets et porte
l'empreinte
`26665774c52313cb1712357bd0e57308a36d425d0231837f9c7bf095ec01c213`.
La PR reste `OPEN`, Draft et non fusionnée, avec un commit, 78 fichiers et
`+15087/-641`. Son titre publié reste
`feat(admin): implement S1.2-03C1 auth session runtime` et son corps conserve
l'empreinte
`115c481fb8e68df4f70668085882035f43c155bdbe2aa5a719671dd7d1c8ac2f`.

### Échec Infrastructure historique

Les quatre runs `pull_request`, tentative 1, portent ce head exact. Launcher
Windows `37128808326`, Security `37128808380` et Quality Linux `37128808376`
ont réussi. Infrastructure `37128808344` a échoué à l'étape
`Validate Admin Auth Session PostgreSQL runtime` : le provisionneur monté en
lecture seule, conservé au mode Git `100644`, était invoqué directement et
Linux a refusé son exécution avec `exit 126` et `permission denied`.

Avant ce refus, le run avait validé l'upgrade des migrations historiques, la
préservation de l'audit legacy, les 39 modèles et 40 tables, les douze
contraintes négatives, le stockage positif et la projection PostgreSQL A/B. Il
n'avait validé ni le provisionnement reader/writer, ni les ACL et refus
associés, ni le parcours HTTP/PostgreSQL/Redis. Les étapes Prepare Compose,
lifecycle et API health avaient été `skipped`. Les deux bases, le conteneur et
les secrets de validation C1 avaient été supprimés. L'étape secondaire
`infra:down` avait ensuite échoué parce que la préparation Compose n'avait pas
créé les fichiers `.local` ; ce second échec n'est ni un PASS ni une preuve de
fuite et reste hors du correctif R1.

### Correctif causal et preuve Linux

R1 ajoute uniquement l'argument distinct `sh` entre le conteneur et le chemin
du provisionneur dans `provisionerArguments()`, puis dans l'appel HTTP/E2E du
wrapper PowerShell. Le provisionneur reste byte-identique, au mode Git
`100644`, monté en lecture seule, avec les mêmes paramètres, secrets, contrôles
SQL, ACL, transactions et refus.

La sonde Linux jetable a copié le provisionneur exact dans un conteneur
PostgreSQL 18.4 après application des trois migrations. Les empreintes hôte et
conteneur étaient identiques :
`3c71c009ad62248da12b2736c2b283fc5bb853af2499c461f5863047e70f646c`.
Les permissions réellement observées étaient `0444` (`-r--r--r--`,
`root:root`, 56 875 octets). L'invocation directe a été refusée avec
`exit 126` ;
deux invocations successives par `sh` ont terminé au code 0 et matérialisé les
deux rôles attendus, prouvant aussi l'idempotence. La première tentative de
sonde n'est pas comptée comme PASS : PowerShell avait promu un `NOTICE` psql
bénin en `NativeCommandError` avant l'invocation. Son conteneur et ses secrets
avaient été supprimés avant la relance concluante.

### Validation intégrée locale R1

Le wrapper corrigé
`apps/api/prisma/run-admin-auth-runtime-validation.ps1` termine au code 0. Les
preuves terminales observées sont : deux bases A/B, trois migrations, 39
modèles, 40 tables, projection de catalogue
`5b2bf03fbe7fc292ff48102e7bbdd66f63a2b0a62b698e350f8122575ab88120`,
dix codes recovery, génération refresh 2, audit v2, douze contraintes
négatives, quatre provisionnements réussis et un refus du writer contaminé
sans mutation. Les deux passages ACL confirment trois projections reader, un
writer limité aux colonnes et des sinks insert-only sans `RETURNING`.

Le parcours HTTP a appliqué les trois migrations puis provisionné les rôles par
le second appel corrigé. Jest termine avec une suite sur une, 18 tests sur 18,
douze opérations, PostgreSQL et Redis réels et clés éphémères. Le conteneur
Redis, son volume, la base HTTP, le conteneur PostgreSQL et le répertoire de
secrets ont tous été supprimés de manière ciblée.

R1 reste limité aux deux fichiers techniques et aux deux documents de preuve
autorisés. Les gates `infra:verify` et `infra:verify-api` ne sont pas répétés :
leurs fichiers sont inchangés et aucun finding précis ne rend leur preuve
caduque. Installations, audits réseau, signatures, licences, suites générales,
Flutter et builds restent également non répétés. La politique open source
reste différée, le fournisseur de clés de production reste **NON QUALIFIÉ** et
C2/C3 restent `Not started`. Au moment de cet instantané prépublication, R1
demeure local, non indexé, non commité et non publié. Après cet instantané,
seul l'état réellement observé dans Git et GitHub fait foi ; aucun SHA, Run ID
ou résultat de publication futur n'est affirmé ici.
