# Rapport S1.2-03C2-P0 — Admin Security Contract Prerequisite

Statut : **P0/R1 PUBLIÉS DANS LA DRAFT PR #51 — INSTANTANÉ LOCAL
PRÉPUBLICATION R2 DU 2026-10-11, NON INDEXÉ, NON COMMITÉ ET NON PUBLIÉ —
L'ÉTAT GIT/GITHUB POSTÉRIEUR FAIT FOI**

Dernière réconciliation : 2026-10-11

## Préflight et bootstrap

Le préflight a confirmé :

- origin/main et le merge C1 exact
  dc97eeef72c4e299988ed19d66460011a8551cf3 ;
- parents ordonnés c97992ca2c82bc4f22f9222ea98ed53714fede4c puis
  f09fce29f43e54f2bf6bba3b043e442df1c94a77 ;
- arbre C1 préservé a4eb9a79da1b676f0037bb547df84b91abb28309 ;
- PR #50 fermée, fusionnée, non Draft, head f09fce29f43e54f2bf6bba3b043e442df1c94a77 ;
- corps final PR #50 de 46 267 octets, SHA-256
  c602bff7a66fcd514575c00ef02c58e114a1e9c2a5fd9fd0ab9d8e4b2e76dae0 ;
- quatre runs push/main, tentative 1, completed/success sur le merge :
  Infrastructure 37778525448, Launcher Windows 37778525505, Security
  37778525338 et Quality Linux 37778525244 ;
- dix worktrees existants propres et préservés, aucune branche, worktree, PR
  ou remote C2/C3 préexistant.

Au moment de cet instantané, le worktree dédié
C:\Users\moham\Music\KORA-PLUS-S1-2-03C2-P0 était créé depuis le merge exact
sur la branche feat/s1-2-03c2-admin-security-contract-prerequisite. La branche
n’avait pas d’upstream. Aucun remote ou PR P0 n’était créé.

## Surface modifiée autorisée

P0 porte sur au plus 17 chemins : six fichiers contractuels existants, huit
documents vivants existants et trois nouveaux documents. Aucun fichier runtime,
Prisma, migration, provisioning, dépendance, lockfile ou workflow n’est
autorisé.

La surface contractuelle finale doit rester à 60 chemins, 67 opérations et 137
schémas, soit 12 opérations C1 et 15 opérations C2. Le généré
packages/contracts/src/generated/audio-pilot.ts est produit uniquement par le
générateur officiel.

## Décisions verrouillées

ADR-026 et le contrat OpenAPI ferment :

- 503 SERVICE_UNAVAILABLE uniforme sur les quinze opérations C2 ;
- matrice par opération : rôles, preuve serveur, purpose step-up, motifs,
  contexte, sinks, action, classe, entité, snapshots et atomicité ;
- reset PASSWORD_RESET strictement distinct de MFA_RECOVERY ;
- neuf POST JSON malformés vers 400 VALIDATION_ERROR et un seul SecurityEvent ;
- notification/outbox, HIBP range fail-closed et e-mails canoniques ;
- idempotence 24 h et invitation de remplacement atomique ;
- trois listes par snapshot authentifié borné ;
- export immuable borné, masking positif et JCS/JWS Ed25519 R4 préservé ;
- bootstrap CLI et identités/ACL PostgreSQL futures sans implémentation ;
- découpage C2a onze opérations + bootstrap, puis C2b quatre opérations.

## Résultats contractuels

| Gate                                        | Résultat                                               |
| ------------------------------------------- | ------------------------------------------------------ |
| Outil Node/npm                              | Node v22.18.0 et npm 10.9.3 conformes                  |
| Installation                                | npm ci --ignore-scripts, 939 packages, code 0          |
| Graphe npm après installation               | npm ls --depth=0, code 0                               |
| OpenAPI                                     | PASS, 60 chemins, 67 opérations, 137 schémas           |
| Mutations adversariales et boundary         | PASS, 317/317                                          |
| Génération exacte                           | PASS, fichier généré courant byte-for-byte             |
| Contracts format/lint/typecheck/tests/build | PASS, tests 8/8                                        |
| Tooling                                     | PASS, 436/436, zéro échec et zéro skip                 |
| Scanner officiel/historique                 | PASS, 388 fichiers, history=true, 52 immuables         |
| Documentation, UTF-8, allowlist et diff     | PASS, 17 chemins exacts, index vide et diff-check vide |

## Essais non comptés comme PASS

Le premier npm ls a été lancé pendant que npm ci terminait encore et a observé
un graphe partiel : code 1, packages extraneous/invalid. Il est
**NON CONCLUSIVE** et n’est pas renommé PASS. Après achèvement confirmé de npm
ci, la reprise npm ls termine au code 0.

Le premier formatage de docs/api/openapi.yaml a laissé Prettier choisir le
parseur YAML d’après l’extension. Le fichier restait YAML mais n’était plus
parsable par JSON.parse, et la génération n’a pas commencé. Le formatage a été
repris avec le parseur JSON explicite.

La première campagne OpenAPI a révélé deux contrôles historiques encore bornés
à C1 : le classificateur générique de réponse 503 et l’ensemble exact des
erreurs download export. Ces deux exécutions restent **NON-PASS**. Les
correctifs causaux ont étendu les contrôles aux seules opérations C2 déjà
contractées; les reprises passent.

Le test boundary initial a aussi interprété les mots normatifs URL/URI de la
politique C2 comme une localisation média. Il reste **NON-PASS**. La reprise
isole la constante normative C2 de cette recherche tout en conservant le
garde-fou sur les opérations et types publics; elle passe.

Le contrôleur documentaire complémentaire initial a d'abord utilisé une clé de
politique mal nommée, puis a traité les paramètres OpenAPI référencés par
`$ref` comme des paramètres inline et a signalé un literal de test de sécurité.
Ces exécutions restent **NON CONCLUSIVE**. Le contrôleur corrigé résout les
références, limite le contrôle ciblé aux signatures de secrets réels et passe
sur les 17 octets finaux sans modifier le contrat.

Une vérification tardive a invoqué par erreur le nom inexistant
`contracts:generate` et termine au code 1 avant toute génération. Elle reste
**NON-PASS**. La commande officielle
`node scripts/openapi/generate-contract-types.mjs --check` a ensuite confirmé
que le fichier généré courant est exact, sans réécriture.

## Runtime et fournisseurs

PostgreSQL, Redis, Docker, HTTP réel, API build, Web, Admin, Flutter, APK,
navigateur et appels fournisseurs sont **NON EXÉCUTÉS**. Aucun runtime C2
n’existe. Notification, HIBP, stockage d’export et clés de production sont
**NON QUALIFIÉS**. La politique OSS reste différée. C3 n’est pas commencé.

## Publication

Dans cet instantané local prépublication du 2026-10-09, P0 était non indexé,
non commité et non publié. Aucun add, commit, push, PR, commentaire, rerun,
Ready, approval, merge, tag, release ou déploiement n’avait été effectué. Toute
publication ultérieure fait foi dans Git et GitHub.

## Diagnostic Infrastructure historique et remédiation R1

Le run Infrastructure `37924510285`, tentative 1, a échoué lors du premier
`docker compose ... start redis` du parcours principal. Le redémarrage Redis
observé ensuite appartient au `finally` et ne démontre pas une récupération du
parcours principal. Le vérificateur assemblait alors l’exception primaire et
les logs API avant de ne conserver que les dix dernières lignes et les 4 000
derniers caractères. L’exception primaire a donc été masquée; son code spawn,
son statut et son signal historiques restent inconnus. La cause de l’échec
Docker historique demeure **NON CONCLUSIVE**.

R1 sépare désormais l’exception principale assainie de la queue assainie des
logs API. Les diagnostics identifient explicitement `main`, `catch` et
`finally`, conservent le code spawn, le statut et le signal lorsqu’ils existent
et distinguent un statut inconnu d’un code numérique. Une erreur du nettoyage
est rapportée séparément et ne peut plus remplacer silencieusement l’erreur
principale. Aucun délai, assertion de santé, ordre fonctionnel, retry Redis,
runtime, fichier Compose ou workflow n’est modifié.

Les preuves locales du 2026-10-10 sont distinctes de toute preuve CI future :

- la reproduction pré-correctif confirme que plus de dix lignes et plus de
  4 000 caractères de logs peuvent masquer l’erreur principale historique ;
- les treize tests ciblés passent, y compris redaction, métadonnées
  spawn/statut/signal et séparation de l’erreur de `finally` ;
- `test:tooling` passe 443/443 ;
- `infra:verify-api` passe au code 0 dans l’instance isolée
  `kora-plus-r1diag-20261010`, avec pannes et récupérations Redis/PostgreSQL,
  reset ciblé, PID API stable et absence de secret ou DSN dans les preuves ;
- l’instance est supprimée, les inventaires Docker étrangers sont inchangés et
  Docker est rendu à son état initial arrêté.

Ces résultats locaux ne requalifient pas l’échec CI historique. La PR #51
reste Draft; aucun succès CI R1 futur n’est affirmé à cet instant. Les
fournisseurs de production restent **NON QUALIFIÉS**, la politique OSS reste
différée et aucun runtime C2/C3 n’est commencé.

## Remédiation locale R2 — causalité typée et durcissement contractuel

Le préflight R2 retrouve exactement le head R1
`07b610886853f858d0c4e2c7ecc7c8730d2fc3ff`, son parent et son arbre, la Draft
PR #51 et son corps de 5 060 octets, les quatre runs R1 au vert, les onze
worktrees propres et la PR #50 fusionnée avec son corps R12 restauré. Aucune
divergence n'a été observée avant édition.

R2 ferme les trois findings de la revue cumulative :

- `AdminAuditLogEntry` conserve les trois contextes historiques et ajoute
  `causationSecurityEventId` sans nouveau schéma. SYSTEM possède exactement les
  branches autonome, délégation administrateur via `AuditLog`, et continuation
  du reset public via `AdminSecurityEvent` ;
- la demande publique, son événement initial et l'outbox restent atomiques. Le
  worker revalide type, action, classe, entité et liaisons serveur; aucun
  identifiant causal, acteur ou délégant ne vient du client ;
- les quinze listes d'erreurs C2 et leurs statuts sont comparés exactement et
  dans l'ordre normatif. Les mutations retrait, ajout, doublon, permutation,
  substitution de même statut et statut incorrect sont refusées ;
- l'exception de `stopChild` est assainie et rapportée comme
  `phase=finally cleanup_error ...; action=stop_api`, sans retry, faux succès ni
  remplacement de l'erreur principale.

La surface reste 60 chemins, 67 opérations et 137 schémas. Prisma, migration,
runtime C1/C2/C3, dépendances, lockfile, workflow, Compose et provisioning ne
sont pas modifiés. Les futures surfaces `app.module.ts` et `app.factory.ts`
devront être autorisées littéralement si le mandat runtime en a besoin.

La première campagne combinée OpenAPI/boundary R2 reste **NON-PASS** à
329/331 : le nouveau helper de fixture ne rejetait pas encore une valeur non
nulle face à `type: null`, ce qui faussait deux assertions de branche. La
correction est limitée à ce contrôle de type; la reprise passe 331/331. Les
résultats techniques finaux observés avant réconciliation documentaire sont :

- OpenAPI 60/67/137 et 39 modèles Prisma préservés ;
- tests adversariaux 324/324 et boundary 8/8 ;
- génération officielle exacte ;
- Contracts format, lint, typecheck, 8/8 tests et build ;
- Infrastructure ciblée 14/14, dont l'injection `stopChild` ;
- `test:tooling` 459/459 ;
- scanner officiel : 388 fichiers, historique actif, 52 sources immuables et
  six scripts d'installation qualifiés.

Deux essais du harnais de preuve restent distincts des gates produit et sont
conservés sans les renommer PASS. Le premier contrôle statique a terminé au
code 1 parce que son `trim()` supprimait l'espace initial de la première ligne
Git porcelain; le contrôle corrigé passe sans changement du gel. Le premier
manifeste PowerShell, bien que valide ligne par ligne, utilisait un ordre de tri
culturel et produisait l'agrégat `f00599e6…`; sa comparaison reste NON-PASS.
Après tri ordinal explicite, les méthodes Node et PowerShell produisent, sur le
gel antérieur à la présente correction documentaire, les mêmes 2 068 octets et
l'agrégat
`782b5e7921c7aaffeff45e2fcf96280cded48f70e910dc39cda5129d17e310df`.

La tentative post-review 034 termine au code 1 avec ses stdout et stderr
capturés vides. Faute de diagnostic archivé dans cette enveloppe, elle reste
**NON CONCLUSIVE** et ne prouve pas que Prettier a démarré. La reprise 035 écrit
les seuls fichiers ciblés, puis le contrôle 036 confirme leur formatage; ces
deux commandes terminent au code 0 et constituent la preuve finale.

L'échec Infrastructure historique reste distinct et sa cause Docker reste
**NON CONCLUSIVE**. Aucun Docker, HTTP réel, PostgreSQL/Redis, build applicatif
ou Flutter n'est exécuté par R2.
