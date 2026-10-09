# Rapport S1.2-03C2-P0 — Admin Security Contract Prerequisite

Statut : **INSTANTANÉ DE VALIDATION LOCALE PRÉPUBLICATION — NON COMMITÉE — NON
PUBLIÉE**

Date : 2026-10-09

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
