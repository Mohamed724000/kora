# KORA+ Final — Codex Execution Prompt

## Sprint 0.1 — Gouvernance du repository et initialisation Git

Statut du lot précédent : **READY FOR SPRINT 0.1**

Date d’autorisation : 2026-07-28  
Repository cible : `KORA-PLUS-FINAL`  
Autorité produit : Mohamed Sogoba — Founder & Product Owner  
Autorité technique : ChatGPT Work — CTO & AI Program Director  
Exécutant : Codex — Principal Engineering Execution Lead

---

## 1. Mission exacte

Établir la première baseline gouvernée et versionnée de KORA+ Final.

Ce lot doit :

1. préserver intégralement la clean room validée au Lot 00C ;
2. créer ou consolider les règles durables du repository ;
3. initialiser Git uniquement à la racine exacte `KORA-PLUS-FINAL` ;
4. créer la branche initiale `main` ;
5. contrôler les fichiers avant indexation ;
6. réaliser le premier commit local uniquement si l’identité Git est déjà
   configurée et valide ;
7. produire un rapport final vérifiable ;
8. s’arrêter sans commencer Sprint 0.2.

Ce lot ne crée aucun code applicatif, aucune dépendance et aucun monorepo.

---

## 2. Configuration d’exécution obligatoire

- Un seul fil principal Codex conserve l’autorité et l’intégration.
- Le fil principal est l’unique auteur de fichiers et l’unique opérateur Git.
- Utiliser exactement deux sous-agents, tous deux strictement en lecture seule :
  1. **Repository Governance Auditor** ;
  2. **Git & Source Integrity Auditor**.
- Les sous-agents ne créent, ne modifient, ne déplacent et ne suppriment rien.
- Ils n’exécutent aucune commande Git qui modifie l’état du repository.
- Ils travaillent sur des périmètres indépendants, rendent des constats au fil
  principal, puis s’arrêtent.
- Le fil principal attend leurs deux résultats avant toute écriture.
- Ne créer aucun nouveau skill, plugin, hook, MCP ou agent permanent.
- Ne faire appel ni à Claude ni à une autre IA externe.
- Ne pas utiliser le web : les sources locales approuvées suffisent.
- Utiliser le plan de travail du fil principal et maintenir une seule étape
  `in_progress` à la fois.

### Sous-agent 1 — Repository Governance Auditor

Mission en lecture seule :

- lire les documents d’autorité listés à la section 4 ;
- vérifier la hiérarchie des sources ;
- inventorier les documents vivants déjà présents ;
- signaler les doublons, contradictions, anciennes instructions exécutables ou
  fichiers de gouvernance manquants ;
- proposer les corrections minimales, sans les appliquer.

### Sous-agent 2 — Git & Source Integrity Auditor

Mission en lecture seule :

- confirmer la racine exacte et l’absence de repository Git ;
- vérifier l’absence de secrets, `.env`, ancien code, dépendances, lockfiles,
  builds, migrations, répertoires extraits et reparse points ;
- vérifier l’unicité et l’intégrité de l’archive AdminLTE canonique ;
- identifier les fichiers binaires à protéger avec `.gitattributes` ;
- vérifier les préconditions du premier commit ;
- ne jamais lancer `git init`, `git add`, `git commit` ou une autre mutation.

---

## 3. Autorisation et limites

Le Product Owner autorise explicitement pour ce lot :

- la création et la modification des seuls fichiers listés à la section 6 ;
- l’initialisation Git à la racine exacte validée ;
- la création de la branche locale `main` ;
- l’indexation des fichiers conformes ;
- un unique premier commit local, sous les conditions de la section 9.

Ne sont pas autorisés :

- la création d’un remote ;
- la connexion ou publication GitHub ;
- `git push`, Pull Request, tag, release ou branche supplémentaire ;
- Git LFS, hook Git ou signature de commit ajoutée/configurée par Codex ;
- la modification de la configuration Git globale ;
- l’invention ou la modification de `user.name` ou `user.email` ;
- toute commande Git destructive, notamment `reset --hard`, `clean`, `checkout
  --`, suppression de branche ou réécriture d’historique ;
- l’installation, la mise à jour ou l’exécution de packages ;
- `npm`, `npm.cmd`, `npx`, `flutter`, `dart`, `docker`, `prisma` ou outils de
  génération ;
- la création de `apps/`, `packages/`, `services/`, `node_modules/`, d’un
  lockfile, d’une migration, d’un build ou d’un fichier d’environnement ;
- la création de `.codex/config.toml` ;
- l’extraction de toute archive ;
- la consultation ou réutilisation de `STREAM/Kora`, `KORA-REBUILD` ou de toute
  ancienne implémentation KORA+ ;
- toute modification des documents sources originaux, archives, assets ou ADR
  acceptés ;
- tout secret, token, clé, mot de passe, DSN, numéro privé ou URL de production.

---

## 4. Préflight obligatoire avant toute écriture

Depuis le répertoire de travail courant :

1. résoudre le chemin absolu réel ;
2. confirmer que son basename est exactement `KORA-PLUS-FINAL` ;
3. confirmer que tous les parents traversés sont dépourvus de reparse point,
   jonction ou lien symbolique ;
4. confirmer que `.git` est absent ;
5. confirmer que `apps/`, `packages/`, `services/`, `node_modules/`, lockfiles,
   migrations, builds, `.env`, secrets et `.code-workspace` sont absents ;
6. inventorier tous les fichiers, y compris les fichiers cachés pertinents ;
7. lire intégralement :
   - `docs/governance/AI_OPERATING_MODEL.md` ;
   - `docs/governance/CLEAN_ROOM_SCOPE.md` ;
   - `docs/roadmap/MASTER_EXECUTION_BLUEPRINT.md` ;
   - `docs/source-material/references/adminlte/README.md` ;
   - `docs/prompts/CODEX_LOT_00C_ADMINLTE_CANONICALIZATION.md` ;
   - les ADR-001 à ADR-024 acceptés ;
   - les registres de gouvernance déjà présents ;
8. vérifier que l’unique `AdminLTE-master.zip` se trouve exactement sous :
   `docs/source-material/references/adminlte/AdminLTE-master.zip` ;
9. confirmer pour cette archive :
   - taille : `13 094 310` octets ;
   - SHA-256 :
     `9B69B877E005E41E06C21F8A4F52CB3B999464E3446FBB961FF962C69B450B5D` ;
   - 547 entrées lisibles en mémoire, sans extraction ;
   - `AdminLTE-master/package.json` indique `admin-lte`, `4.1.0`, `MIT` ;
10. confirmer que le prompt historique Lot 00 reste historique et non
    exécutable ;
11. vérifier que Git `2.54.0.windows.1` est accessible ;
12. rechercher les secrets de manière locale et non destructive, sans afficher
    la valeur d’un éventuel secret.

Si une de ces préconditions échoue, arrêter **avant toute écriture** avec le
verdict `NOT READY — S0.1 PREFLIGHT FAILED`.

Ne pas imposer un nombre total de fichiers fixe : le prompt S0.1 lui-même a été
ajouté après le Lot 00C. Expliquer toute variation par chemin et par opération.

---

## 5. Hiérarchie d’autorité à appliquer

1. Cahier des charges V4 — produit, métier et périmètre.
2. ADR-001 à ADR-024 avec statut `Accepted`.
3. Engineering Specification + Addendum V1.1.
4. UI/UX Design Specification V1.
5. Back-Office AdminLTE Integration Specification V1.1.
6. Specification Alignment Register.
7. Benchmark Empire Afrique — référence ergonomique uniquement.

Pour l’exécution clean room et l’ordre des travaux :

1. `docs/governance/CLEAN_ROOM_SCOPE.md` ;
2. `docs/roadmap/MASTER_EXECUTION_BLUEPRINT.md` ;
3. `docs/governance/AI_OPERATING_MODEL.md` ;
4. le présent prompt de lot.

Une contradiction non déjà arbitrée n’est jamais résolue silencieusement.
L’inscrire dans le registre et la signaler dans le rapport. Ne modifier aucun
ADR accepté dans ce lot.

---

## 6. Écritures autorisées

Le fil principal peut uniquement créer ou consolider :

### À la racine

- `AGENTS.md`
- `README.md`
- `CONTRIBUTING.md`
- `.gitignore`
- `.gitattributes`
- `.editorconfig`

### Gouvernance

- `docs/governance/SOURCE_OF_TRUTH.md`
- `docs/governance/SPEC_ALIGNMENT_REGISTER.md`
- `docs/governance/DECISION_LOG.md`
- `docs/governance/GIT_WORKFLOW.md`
- `docs/governance/OWNERSHIP_MATRIX.md`
- `docs/governance/SOURCE_BASELINE_MANIFEST.sha256`

### Roadmap, qualité et sécurité

- `docs/roadmap/MVP_EXECUTION_PLAN.md`
- `docs/qa/REQUIREMENTS_TRACEABILITY_MATRIX.md`
- `docs/qa/DEFINITION_OF_DONE.md`
- `docs/security/THREAT_MODEL.md`

### Règle de préservation

Si un fichier autorisé existe déjà :

- le lire intégralement ;
- préserver toutes les décisions approuvées et toute information plus précise ;
- ne corriger que les lacunes nécessaires au présent lot ;
- ne jamais remplacer un document plus complet par un squelette ;
- documenter précisément chaque modification dans le rapport.

Tous les autres chemins sont en lecture seule.

Ne pas créer `.github/CODEOWNERS` : aucun identifiant GitHub officiel n’est
encore approuvé. Utiliser `OWNERSHIP_MATRIX.md` sans inventer de compte.

---

## 7. Contenu obligatoire de la gouvernance

### `AGENTS.md`

Document concis, actionnable et inférieur à 32 KiB. Il doit imposer au minimum :

- racine active unique `KORA-PLUS-FINAL` ;
- interdiction absolue de réutiliser l’ancien code ;
- hiérarchie des sources ;
- stack verrouillée ;
- Product Owner et autorité technique ;
- un seul orchestrateur pour les fichiers racine et l’intégration ;
- sous-agents uniquement pour des tâches indépendantes et des périmètres
  d’écriture disjoints ;
- aucune décision produit majeure inventée ;
- aucune dépendance de production ajoutée sans justification et contrôle ;
- jamais de secret dans le repository ou les logs ;
- aucune logique financière non validée côté serveur ;
- aucune URL média brute ;
- tests, lint, typecheck et build obligatoires lorsqu’ils existeront ;
- un lot, une branche et une Pull Request après création du remote ;
- validators en lecture seule : ils signalent, le propriétaire corrige ;
- commandes destructives interdites ;
- signalement honnête des tests non exécutables ;
- mise à jour des documents vivants et de la traçabilité avec tout changement.

Ne pas dupliquer tout le cahier des charges dans `AGENTS.md`. Pointer vers les
documents d’autorité.

### `SOURCE_OF_TRUTH.md`

- hiérarchie complète et règle de résolution des contradictions ;
- distinction entre source normative, correction ADR, document opérationnel,
  benchmark et archive historique ;
- liste des documents vivants ;
- règle de non-réécriture silencieuse des décisions.

### `SPEC_ALIGNMENT_REGISTER.md`

- préserver le registre approuvé ;
- chaque entrée possède identifiant, source A, source B, décision, justification,
  impact, ADR éventuel, statut et date ;
- aucune contradiction déjà résolue ne redevient ouverte ;
- ne créer une nouvelle entrée que si le préflight révèle un nouvel écart réel.

### `DECISION_LOG.md`

- préserver les 40 décisions déjà arbitrées ;
- ajouter uniquement les décisions de gouvernance du présent lot :
  clean room, racine technique, baseline outil, Git local, branche `main`,
  exception contrôlée du premier commit, absence de remote et report de Docker
  à S0.4 ;
- distinguer décision technique, décision produit et décision réservée au
  Product Owner.

### `SOURCE_BASELINE_MANIFEST.sha256`

- produire un manifeste SHA-256 trié et déterministe des sources immuables :
  documents officiels, archives canoniques, documents d’autorité et ADR
  acceptés ;
- utiliser des chemins relatifs à la racine avec séparateurs `/` ;
- ne pas inclure `.git/`, le manifeste lui-même, les rapports temporaires ou
  les fichiers de travail ;
- vérifier le manifeste avant et après le commit.

### `GIT_WORKFLOW.md`

- `main` devient la branche stable ;
- le premier commit local S0.1 est l’unique exception de bootstrap ;
- après ce commit : une branche par lot ou fonctionnalité ;
- noms recommandés : `chore/s0-x-*`, `feat/*`, `fix/*`, `docs/*` ;
- aucune modification directe de `main` après mise en place du remote ;
- Pull Request, revue, contrôles verts et traçabilité avant fusion ;
- pas de force-push sur `main` ;
- pas de secret ni gros artefact généré ;
- stratégie de commit claire et messages conventionnels ;
- procédure de rollback non destructive ;
- aucun remote créé tant que le Product Owner ne l’autorise pas.

### `OWNERSHIP_MATRIX.md`

- Mohamed Sogoba : vision, business, marque, contrats, dépenses et validation
  visuelle finale ;
- ChatGPT Work : CTO, architecture, arbitrage technique, prompts, Go/No-Go ;
- Codex orchestrateur : intégration, Git, fichiers racine et exécution ;
- spécialistes : périmètres disjoints et demandes d’intégration ;
- Claude : documentation produit/design longue, toujours auditée avant
  exécution ;
- aucune identité GitHub ou adresse e-mail inventée.

### `MVP_EXECUTION_PLAN.md`

- conserver le plan approuvé ;
- refléter les gates et lots du Master Blueprint ;
- marquer Gate 0 et Lots 00/00B/00C terminés ;
- marquer S0.1 `in progress` uniquement pendant l’exécution, puis `completed`
  seulement si ses critères sont atteints ;
- ne pas marquer S0.2 ou une fonctionnalité comme commencée.

### `REQUIREMENTS_TRACEABILITY_MATRIX.md`

- établir le format vivant de traçabilité ;
- relier exigences, sources, ADR, lots, preuves et statut ;
- importer ou synthétiser fidèlement la matrice officielle, sans perdre les
  identifiants ni inventer un statut d’implémentation ;
- toutes les fonctionnalités restent `Not started` à la fin de S0.1 ;
- seules les exigences de gouvernance peuvent être `Verified`.

### `DEFINITION_OF_DONE.md`

- DoD globale ;
- DoD par lot ;
- qualité, sécurité, accessibilité, performance, documentation et traçabilité ;
- preuves obligatoires ;
- aucun test non exécuté déclaré réussi ;
- critères supplémentaires pour paiements, ledger, médias et offline, sans les
  implémenter maintenant.

### `THREAT_MODEL.md`

- modèle initial fondé sur les frontières de confiance futures ;
- actifs : identité, OTP, paiements, ledger, droits, médias, données
  personnelles, back-office, secrets et logs ;
- menaces principales et mesures attendues ;
- décisions déjà acceptées citées sans inventer d’implémentation ;
- risques explicitement ouverts et gates de sécurité futurs ;
- aucune affirmation que les contrôles non développés sont déjà opérationnels.

### Fichiers racine techniques

`.gitignore` doit couvrir au minimum :

- secrets et variantes `.env`, en conservant les futurs `.env.example` ;
- Node/Next/Nest, Flutter/Dart, Prisma, coverage, builds, caches et logs ;
- VS Code/IDE, fichiers OS, Crashpad et fichiers temporaires ;
- sorties Docker et outils locaux pertinentes ;
- sans ignorer les documents officiels, ADR, assets officiels ou archives
  canoniques.

`.gitattributes` doit :

- normaliser les fichiers texte en LF ;
- conserver les scripts Windows appropriés en CRLF ;
- marquer ZIP, DOCX, XLSX, PDF et images comme binaires ;
- ne pas activer Git LFS.

`.editorconfig` doit fournir des règles minimales et neutres, sans dépendre d’un
framework non encore initialisé.

`README.md` et `CONTRIBUTING.md` doivent expliquer l’état actuel, la clean room,
la source de vérité, le workflow, les prérequis et l’interdiction de commencer
un lot non autorisé. Ne documenter aucune commande d’installation inexistante.

---

## 8. Initialisation Git

Après création et validation des fichiers :

1. revérifier la racine exacte ;
2. exécuter `git init -b main` uniquement dans cette racine ;
3. vérifier :
   - `git rev-parse --show-toplevel` ;
   - `git branch --show-current` retourne `main` ;
   - aucun remote n’existe ;
4. inspecter la configuration effective sans la modifier :
   - `git config --get user.name` ;
   - `git config --get user.email` ;
5. exécuter un scan final des secrets et fichiers interdits ;
6. inspecter les conteneurs ZIP/OOXML en mémoire, sans extraction persistante :
   intégrité, macros, objets incorporés, relations externes, commentaires,
   suivi de modifications et métadonnées potentiellement sensibles ;
7. arrêter avant commit si une donnée sensible réelle est détectée ; ne jamais
   afficher sa valeur dans le rapport ;
8. vérifier les liens Markdown relatifs ;
9. vérifier les fichiers ignorés de manière ciblée ;
10. confirmer qu’aucun fichier ne dépasse 100 MiB et expliquer tout fichier
    supérieur à 50 MiB ;
11. indexer uniquement la baseline conforme ;
12. exécuter :
   - `git status --short` ;
   - `git diff --cached --check` ;
   - `git diff --cached --stat` ;
   - contrôle des fichiers indexés et de leurs tailles ;
13. confirmer qu’aucun fichier source officiel attendu n’est ignoré ou absent.

Ne pas modifier la configuration Git globale ou locale pour fabriquer une
identité.

---

## 9. Premier commit local conditionnel

Le commit est autorisé uniquement si :

- `user.name` et `user.email` existent déjà et ne sont pas vides ;
- le scan de secrets est propre ;
- tous les contrôles de la section 8 passent ;
- aucun fichier interdit n’est indexé ;
- aucun sous-agent n’a écrit ;
- les fichiers officiels et l’archive canonique sont intacts.

Message exact du commit :

```text
chore(repo): establish clean-room governance baseline
```

Ne pas ajouter de co-auteur IA. Ne pas créer de tag.

Si l’identité Git manque :

- ne pas l’inventer ;
- ne pas committer ;
- ne rien indexer : la vérification d’identité doit avoir lieu avant
  `git add` ;
- rendre le verdict
  `PARTIAL — GOVERNANCE READY, COMMIT BLOCKED BY GIT IDENTITY` ;
- indiquer uniquement que le Product Owner doit fournir ou configurer son nom
  et son e-mail Git, sans proposer de valeur fictive.

Si le commit réussit :

- vérifier que `HEAD` existe ;
- vérifier le message et le hash du commit ;
- vérifier que `git rev-list --count HEAD` retourne exactement `1` et que le
  root commit n’a aucun parent ;
- exécuter `git fsck --full` ;
- vérifier que l’arbre de travail est propre ;
- vérifier qu’aucun remote n’existe.

---

## 10. Validation finale indépendante

Après les écritures et l’éventuel commit, demander aux deux sous-agents de
reprendre une dernière passe strictement en lecture seule :

- Governance Auditor : cohérence et couverture des documents ;
- Git & Source Integrity Auditor : racine, branche, HEAD, remote, état de
  travail, secrets, archive canonique et absence de code/dépendances.

Un validateur ne corrige rien. Toute correction nécessaire revient au fil
principal, puis les contrôles affectés sont rejoués.

Vérifications finales obligatoires :

- racine exacte `KORA-PLUS-FINAL` ;
- clean room intacte ;
- un seul `AdminLTE-master.zip`, chemin et SHA-256 conformes ;
- `AGENTS.md` présent, concis et inférieur à 32 KiB ;
- documents vivants présents et cohérents ;
- manifeste SHA-256 trié et vérifié ;
- liens Markdown relatifs valides ;
- ADR-001 à ADR-024 toujours `Accepted` et non modifiés ;
- aucun secret ou `.env` ;
- aucun code, `apps/`, `packages/`, dépendance, lockfile, migration ou build ;
- Git initialisé ;
- branche `main` ;
- aucun remote ;
- soit un premier commit conforme et arbre propre, soit le blocage d’identité
  explicitement rapporté ;
- Docker non utilisé et toujours différé à S0.4 ;
- S0.2 non commencé.

---

## 11. Verdicts autorisés

### `READY FOR SPRINT 0.2`

Uniquement si :

- la gouvernance est complète ;
- Git est initialisé sur `main` ;
- le premier commit local conforme existe ;
- l’arbre de travail est propre ;
- aucun remote n’existe ;
- tous les contrôles finaux passent.

### `PARTIAL — GOVERNANCE READY, COMMIT BLOCKED BY GIT IDENTITY`

Uniquement si toute la gouvernance est conforme, Git est initialisé, mais le
commit est impossible parce que `user.name` ou `user.email` manque.

### `NOT READY FOR SPRINT 0.2`

Pour toute autre défaillance ou violation de périmètre.

---

## 12. Rapport final obligatoire en français

Le rapport doit contenir :

1. verdict ;
2. racine, branche, HEAD et remotes ;
3. configuration des agents et confirmation de lecture seule ;
4. préflight et intégrité clean room ;
5. fichiers créés ;
6. fichiers modifiés avec résumé précis ;
7. fichiers préservés et leurs contrôles ;
8. règles de gouvernance établies ;
9. résultats du scan de secrets ;
10. commandes Git exécutées et codes de sortie ;
11. état de l’index et du working tree ;
12. commit : hash, message et auteur, ou blocage d’identité ;
13. critères d’acceptation PASS/FAIL ;
14. écarts et risques ;
15. confirmation qu’aucun code, package, Docker, remote ou S0.2 n’a commencé ;
16. liste exhaustive des écritures ;
17. recommandation finale.

Ne jamais déclarer un contrôle réussi sans preuve. Ne masquer aucun échec et
ne poursuivre aucun lot suivant.
