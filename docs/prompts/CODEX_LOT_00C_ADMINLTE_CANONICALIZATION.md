# KORA+ Final — Codex Lot 00C

## Canonicalisation finale d’AdminLTE et autorisation de Sprint 0.1

Tu es l’orchestrateur principal d’ingénierie de KORA+.

Ce lot succède au Lot 00B conclu `NOT READY FOR SPRINT 0.1` pour un seul
motif : une copie réelle d’AdminLTE existe hors du chemin canonique.

Ce lot ne commence pas Sprint 0.1. Il effectue une correction unique,
strictement bornée, puis vérifie à nouveau la readiness.

## 1. Configuration d’exécution obligatoire

- Modèle recommandé : `GPT-5.6 Sol`.
- Niveau de réflexion : `Extra High`.
- Utiliser un seul fil de discussion principal.
- Le fil principal est l’unique orchestrateur et le seul autorisé à écrire.
- Créer au maximum un sous-agent `Clean-room Integrity Auditor`, strictement
  en lecture seule.
- N’utiliser aucun autre agent.
- Ne créer aucun nouveau skill.
- Ne faire appel ni à Claude ni à une autre IA externe.
- Ne lancer aucun travail en parallèle susceptible d’écrire dans le dépôt.

## 2. Racine obligatoire

Travaille uniquement dans la racine déjà ouverte dont le basename est
exactement :

`KORA-PLUS-FINAL`

Chemin attendu sous Windows :

`C:\Users\moham\Music\KORA-PLUS-FINAL`

Si le basename ou la racine ne correspond pas exactement, arrête-toi sans
écriture et rends `NOT READY FOR SPRINT 0.1`.

## 3. Autorités à lire intégralement

Avant toute suppression, lis intégralement :

1. `docs/governance/AI_OPERATING_MODEL.md`
2. `docs/governance/CLEAN_ROOM_SCOPE.md`
3. `docs/roadmap/MASTER_EXECUTION_BLUEPRINT.md`
4. `docs/source-material/references/adminlte/README.md`
5. `docs/prompts/CODEX_LOT_00B_READINESS_REMEDIATION.md`

Les anciennes instructions visant `KORA-REBUILD`, Sprint 0A, Sprint 0B ou un
ancien projet Flutter sont historiques et non exécutables.

## 4. Mission unique

Supprimer uniquement cette copie AdminLTE hors chemin canonique :

`docs/references/adminlte/AdminLTE-master.zip`

Conserver intacte l’unique archive canonique :

`docs/source-material/references/adminlte/AdminLTE-master.zip`

## 5. Conditions préalables obligatoires

Avant la suppression, le fil principal et le sous-agent en lecture seule
doivent vérifier indépendamment les points suivants :

1. Les deux chemins désignent deux fichiers réguliers réels.
2. Aucun des deux chemins n’est un lien symbolique, une jonction ou un reparse
   point.
3. L’archive canonique existe et reste lisible.
4. Les deux archives ont exactement ce SHA-256 :

   `9B69B877E005E41E06C21F8A4F52CB3B999464E3446FBB961FF962C69B450B5D`

5. Les deux archives sont byte-for-byte identiques.
6. L’archive canonique contient 547 entrées ZIP lisibles sans extraction.
7. Son `AdminLTE-master/package.json` indique :
   - `name` : `admin-lte`
   - `version` : `4.1.0`
   - `license` : `MIT`
8. `apps/` est toujours absent.

Si une seule condition échoue, ne supprime rien. Arrête-toi et rends
`NOT READY FOR SPRINT 0.1` avec l’écart exact.

## 6. Écriture explicitement autorisée

Après réussite de toutes les conditions préalables, le fil principal est
explicitement autorisé à supprimer définitivement :

`docs/references/adminlte/AdminLTE-master.zip`

Cette autorisation ne couvre aucun autre fichier ni dossier.

La suppression doit utiliser le chemin littéral exact. N’utilise ni glob, ni
joker, ni chemin calculé, ni suppression récursive.

Ne supprime pas le dossier parent, même s’il devient vide.

## 7. Interdictions absolues

- Ne supprime, ne déplace, ne renomme et ne modifie aucun autre fichier.
- Ne touche jamais à l’archive canonique.
- N’extrais aucune archive AdminLTE.
- Ne lance aucun script ou installateur provenant d’AdminLTE.
- N’exécute aucun `npm install`, `npm ci`, `npx`, `flutter create` ou équivalent.
- N’initialise pas Git.
- Ne crée ni commit, ni branche, ni tag.
- Ne génère aucun code applicatif.
- Ne crée aucun fichier de rapport dans le projet.
- Ne modifie aucune configuration Docker.
- N’inspecte aucun ancien projet KORA+.
- Ne corrige pas l’accès Docker : ce bloqueur reste différé à Sprint 0.4.
- Ne supprime pas la copie historique du prompt Lot 00 située sous
  `docs/source-material/originals/prompts/`.

## 8. Vérifications après suppression

Après la suppression, vérifie :

1. `docs/references/adminlte/AdminLTE-master.zip` est absent.
2. `docs/source-material/references/adminlte/AdminLTE-master.zip` existe,
   reste lisible et conserve le SHA-256 attendu.
3. Une recherche exhaustive sous la racine trouve exactement une archive
   nommée `AdminLTE-master.zip`, au chemin canonique.
4. Aucune archive AdminLTE n’a été extraite.
5. `apps/` est toujours absent.
6. Aucun fichier `.env`, secret, migration, lockfile, dépendance installée ou
   build n’est apparu.
7. Git est toujours absent et aucun `git init` n’a été exécuté.
8. L’inventaire final compte 51 fichiers, sauf si une explication factuelle
   démontre qu’un fichier non écrit par ce lot a changé simultanément.
9. La copie historique du prompt Lot 00 reste présente, identique et
   non exécutable.
10. Aucun autre fichier officiel n’a été modifié.

## 9. Critères d’acceptation

Le verdict est `READY FOR SPRINT 0.1` uniquement si :

- toutes les conditions préalables ont réussi ;
- seule la copie non canonique a été supprimée ;
- l’archive canonique est l’unique copie AdminLTE restante ;
- tous les contrôles post-suppression réussissent ;
- aucun autre bloqueur S0.1 n’est détecté ;
- Docker reste correctement classé
  `BLOCKER FOR SPRINT 0.4 — NOT BLOCKING SPRINT 0.1`.

Sinon, le verdict est `NOT READY FOR SPRINT 0.1`.

## 10. Rapport final obligatoire

Rends un seul rapport final en français, directement dans la conversation, avec :

1. Verdict exact.
2. Racine et basename vérifiés.
3. Résultat du sous-agent et consolidation du fil principal.
4. Contrôles avant suppression, incluant les deux chemins, tailles et SHA-256.
5. Suppression effectuée ou refusée, avec motif.
6. Contrôles après suppression.
7. Inventaire final et nombre de copies AdminLTE.
8. Confirmation qu’aucune autre écriture n’a été effectuée.
9. État Git.
10. Classification Docker.
11. Liste exacte des bloqueurs S0.1 restants, ou `AUCUN`.
12. Recommandation finale.

N’affirme jamais qu’un contrôle a réussi sans l’avoir exécuté.

## 11. Condition d’arrêt

Arrête-toi immédiatement après le rapport.

Même si le verdict est `READY FOR SPRINT 0.1`, ne commence pas Sprint 0.1,
n’initialise pas Git et attends une nouvelle autorisation explicite.
