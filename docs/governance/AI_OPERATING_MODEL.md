# KORA+ — AI Program Operating Model

Statut : **APPROUVÉ — AUTORITÉ OPÉRATIONNELLE**

Date d’effet : 2026-07-28

Projet : KORA+ Final

Racine technique : `KORA-PLUS-FINAL`

## 1. Décision directrice

KORA+ repart en **clean room**. L’ancien code reste intact mais n’est ni copié,
ni corrigé, ni consulté comme modèle d’implémentation.

La documentation et les décisions validées sont conservées, car elles décrivent
le produit voulu. Le code est recréé à neuf à partir des sources de vérité.

## 2. Autorité et responsabilités

### Mohamed Sogoba — Founder & Product Owner

Décide uniquement lorsque le sujet touche :

- au modèle économique, aux revenus ou aux dépenses importantes ;
- aux contrats, partenaires, paiements réels ou contraintes juridiques ;
- à la marque et à la validation visuelle finale ;
- à une modification irréversible du périmètre.

Mohamed n’est pas chargé de trouver les manques techniques.

### ChatGPT Work — CTO & AI Program Director

Autorité finale de coordination :

- maintient la source de vérité ;
- arbitre les contradictions ;
- approuve ou rejette les propositions de Claude ;
- transforme la roadmap en lots Codex exécutables ;
- contrôle architecture, sécurité, qualité et dette technique ;
- vérifie les rapports et preuves avant tout Go/No-Go ;
- prépare le lot suivant selon l’état réel du repository.

### Claude — Principal Documentation & Design Architect

Claude intervient pour :

- analyser intégralement les longs documents ;
- produire un brouillon détaillé de roadmap et de dépendances ;
- analyser les captures, vidéos et parcours ;
- développer les spécifications produit et UI/UX ;
- détecter des oublis et proposer des améliorations documentaires.

Claude ne peut pas :

- modifier seul la stack verrouillée ;
- rendre une décision d’architecture définitive ;
- envoyer directement un ordre d’exécution non audité à Codex ;
- déclarer une fonctionnalité prête sans preuve dans le repository ;
- remplacer les ADR acceptés par de nouvelles préférences.

Tout livrable Claude est un **draft** jusqu’à validation par ChatGPT Work.

### Codex — Principal Engineering Execution Lead

Codex :

- écrit le code et les migrations ;
- exécute lint, typecheck, tests et builds ;
- maintient OpenAPI, Prisma et la documentation vivante ;
- utilise des agents spécialisés lorsque le lot le justifie ;
- produit des preuves vérifiables ;
- s’arrête lorsqu’une décision produit ou une autorité supplémentaire est
  nécessaire.

Codex ne redéfinit pas le produit et ne comble pas silencieusement une
contradiction.

## 3. Pourquoi ne pas lancer onze agents permanents

Les onze domaines définissent des **expertises**, pas onze agents devant écrire
en permanence et simultanément.

Un trop grand nombre d’agents actifs produit :

- des modifications concurrentes des mêmes fichiers ;
- des décisions divergentes ;
- des contrats API et modèles de données désynchronisés ;
- davantage de revue et de reprises ;
- une fausse impression de vitesse.

Règle officielle :

- un orchestrateur conserve l’autorité ;
- un seul propriétaire écrit un fichier à un instant donné ;
- trois spécialistes maximum travaillent en parallèle par défaut ;
- les agents de contrôle sont en lecture seule ;
- seuls les travaux indépendants et aux périmètres de fichiers disjoints sont
  parallélisés ;
- chaque vague est intégrée et validée avant la suivante.

## 4. Modèle d’agents par lot

Les rôles sont instanciés selon le besoin :

1. Product & Requirements Auditor — lecture seule.
2. Principal Software Architect — contrats et ADR.
3. Flutter Lead — `apps/mobile/**`.
4. Backend/API Lead — `apps/api/**`.
5. Data & Finance Lead — Prisma, intégrité et réconciliation.
6. Web Public Lead — `apps/web/**`.
7. Back-Office Lead — `apps/admin/**`.
8. Security & Privacy Lead — audit en lecture seule, sauf lot explicitement
   autorisé.
9. QA & Release Lead — tests et preuves.
10. DevOps & Observability Lead — `infra/**` et CI.
11. Design QA — comparaison visuelle en lecture seule.

Tous ne sont pas créés à chaque lot.

## 5. Déroulement standard d’un lot

### Gate A — Definition of Ready

Le lot possède :

- un objectif unique et mesurable ;
- les exigences et ADR applicables ;
- des fichiers autorisés et interdits ;
- des dépendances satisfaites ;
- des critères d’acceptation ;
- des tests et commandes de validation ;
- des conditions d’arrêt.

### Gate B — Préflight

Codex enregistre :

- racine, branche, HEAD et état Git ;
- modifications préexistantes ;
- outils et versions réellement disponibles ;
- documents de référence trouvés ;
- risques de chevauchement.

### Gate C — Exécution

L’orchestrateur attribue des zones de propriété exclusives. Les agents ne
modifient pas le même fichier. Les décisions nouvelles sont inscrites dans le
Decision Log et, si nécessaire, dans un ADR.

### Gate D — Validation

Les contrôles applicables passent :

- format, lint et typecheck ;
- tests unitaires, intégration, widget/golden et E2E ;
- builds ;
- sécurité et secrets ;
- accessibilité et performance ;
- OpenAPI/Prisma/contrats ;
- états loading, vide, erreur et offline ;
- captures UI.

### Gate E — Revue CTO

ChatGPT Work compare le résultat :

- au prompt du lot ;
- aux sources de vérité ;
- aux critères de sortie ;
- aux preuves fournies ;
- au diff réel.

Décision : PASS, PASS AVEC RÉSERVES ou FAIL.

## 6. Stratégie d’exécution

### Phase 0 — Gouvernance et contrats

Installer les documents officiels, ADR-001 à ADR-024, Source of Truth,
Alignment Register, Decision Log, Definition of Done, matrice de traçabilité,
Threat Model et contrat OpenAPI pilote.

### Sprint 0 — Clean-room foundation

Créer le monorepo, les quatre applications, les packages communs, Docker local,
CI, observabilité, design tokens et tests minimaux. Aucun métier transactionnel.

### Slice 1 — Audio purchase pilot

Accueil public → catalogue → fiche contenu → authentification téléphone/OTP →
commande → paiement sandbox → entitlement → Mes achats → lecture signée →
création du contenu par le back-office.

### Slices suivantes

1. recherche, catégories et web public ;
2. albums, playlists et autres médias ;
3. offline sécurisé ;
4. finance artiste et retraits ;
5. fidélité, notifications et opérations de sécurité ;
6. bêta, durcissement et production contrôlée.

La billetterie, les avis et les fonctions explicitement classées V2 ne doivent
pas entrer dans le MVP.

## 7. Documents vivants

Un grand plan figé ne suffit pas. La baseline opérationnelle comprend :

- `AGENTS.md` ;
- `docs/governance/SOURCE_OF_TRUTH.md` ;
- `docs/governance/SPEC_ALIGNMENT_REGISTER.md` ;
- `docs/governance/DECISION_LOG.md` ;
- `docs/roadmap/MASTER_EXECUTION_BLUEPRINT.md` ;
- `docs/roadmap/MVP_EXECUTION_PLAN.md` ;
- `docs/qa/REQUIREMENTS_TRACEABILITY_MATRIX.md` ;
- `docs/qa/DEFINITION_OF_DONE.md` ;
- `docs/security/THREAT_MODEL.md` ;
- `docs/api/openapi.yaml` ;
- `docs/adr/ADR-*.md`.

Le Master Blueprint explique la stratégie. Les prompts de lots donnent les
instructions exactes selon l’état réel du repository.

## 8. Références AdminLTE

L’archive source AdminLTE 4.1.0 est conservée uniquement sous :

`docs/source-material/references/adminlte/AdminLTE-master.zip`

Elle n’est jamais extraite dans `apps/admin`, jamais installée comme projet et
aucune de ses pages HTML n’est copiée.

Le back-office KORA+ utilise les packages npm déclarés dans `apps/admin` :

- `@adminlte/react` ;
- `bootstrap` ;
- `bootstrap-icons` ;
- `@tanstack/react-table` ;
- `apexcharts`.

TanStack Table reste le moteur des tableaux. AdminLTE fournit uniquement
l’habillage visuel prévu par la spécification.
