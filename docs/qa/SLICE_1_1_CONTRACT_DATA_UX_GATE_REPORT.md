# S1.1 — Contract, Data & UX Gate Report

Statut de l’instantané du 2026-09-07 : **VALIDÉ LOCALEMENT — PRÊT POUR
DÉCISION CTO DE COMMIT**

- Date : 2026-09-07
- Branche : `feat/s1-1-audio-contract-data-ux-gate`
- Base et HEAD lors de la validation locale :
  `3b05bfd83a65ab552c6c08f114b8ee0261103f30`

## Objectif et périmètre

S1.1 livre le contrat OpenAPI, le modèle Prisma cible sans migration, les types
générés, les préconditions exécutables, les primitives UX mobile/admin et leurs
preuves. Le lot ne livre aucun contrôleur, service, paiement, transaction
financière, fournisseur réel, migration, seed ou déploiement.

Au moment de la validation locale du 2026-09-07, aucun commit, push ou
changement GitHub S1.1 n’avait encore été effectué et S1.2 n’avait pas été
commencé. Cette mention est un instantané historique de prépublication ; tout
statut ultérieur de publication doit être constaté dans l’historique Git et dans
la Draft PR correspondante.

## État correctif S1.1-R1 du 2026-09-08

La revue CTO finale de la Draft PR #36 a demandé neuf corrections locales. R1
sépare inscription, connexion, vérification OTP et step-up ; impose le mot de
passe avant OTP, les téléphones E.164, les classes exactes de sécurité et les
enveloppes fermées `{data, meta}` / `{error: {code, message, details}}`. Les
schémas publics d’authentification, leurs enveloppes et la liste bornée des
appareils sont fermés sur leurs propriétés exactes ; les variantes de secrets
serveur combinant credentials, mots de passe, tokens, codes ou empreintes avec
`hash` ou `digest` sont rejetées. Le contexte OTP cible conserve hashes, preuve
password, appareil, client et session selon le parcours, sans oracle d’existence
de compte. Les relations Prisma
session/appareil, descripteur/droit/appareil et idempotence/commande sont
composites par client avec `Restrict` et tests négatifs dédiés.

Côté Flutter, les annonces succès paiement et hors connexion sont des régions
vivantes, le moyen de paiement est un radio exclusif actionnable et les lecteurs
annoncent une seule fois titre, artiste et état dérivé de `isPlaying`,
séparément de l’action, y compris à vide. Les
dimensions, espacements, rayons et métriques typographiques sont centralisés
dans les tokens existants. L’intégration complète `AppLocalizations` est
formellement différée au lot runtime mobile : R1 n’ajoute ni manifeste,
dépendance, infrastructure i18n ni nouvelle chaîne visible imposée au runtime ;
les nouveaux libellés d’état sont fournis par l’appelant.

Lors du point de validation prépublication du 2026-09-08, S1.1-R1 était
uniquement présent dans le worktree local, non indexé, non commité et non publié.
Cette mention constitue un instantané historique ; tout état de publication
ultérieur est établi par l’historique Git et la PR #36. S1.2 restait non démarré
à cet instant.

## Décisions acceptées

### Fractions de FCFA — Product Owner

La règle officielle est `FLOOR_SETTLEMENT_WITH_ARTIST_CARRY_V1`. KORA+ paie
uniquement les FCFA entiers. Le reliquat de numérateur appartient au même
artiste et est reporté automatiquement, une seule fois, sur son règlement
suivant. Cette décision remplace les propositions historiques de
`ROUND_HALF_UP`, d’arrondi au plus proche et d’abandon du reliquat à la
plateforme.

### Intégrité composite — CTO

Chaque `ArtistEarning` est structurellement relié au même `ArtistSettlement`,
`Settlement`, `OrderItem`, `AudioContent` et artiste. Les clés composites et
unicités protègent la provenance, l’absence de double rémunération d’une ligne,
l’ordre des règlements par artiste et la consommation unique du carry
précédent. Les relations financières cibles utilisent `onDelete: Restrict` et
`onUpdate: Restrict`.

## Formule exacte

Le dénominateur est `10_000n`. L’algorithme de référence utilise exclusivement
des entiers `BigInt` :

```text
exactNumerator =
  carryInNumerator
  + somme(frozenBasisCfa × artistRevenueShareBps)

payableAmountCfa = exactNumerator / 10_000
carryOutNumerator = exactNumerator % 10_000
```

Équation de conservation testée :

```text
carryInNumerator + somme(exactEarningNumerators)
= payableAmountCfa × 10_000 + carryOutNumerator
```

Exemple obligatoire validé :

- règlement 1 : `101 × 2 000 = 202 000` ; paiement `20 FCFA` ; carry `2 000` ;
- règlement 2 : `4 × 2 000 + 2 000 = 10 000` ; paiement `1 FCFA` ; carry `0`.

## Contrats et modèle

- OpenAPI R1 : 32 chemins, 38 opérations, 85 schémas, 14 invariants et 21
  préconditions transactionnelles formelles ;
- Prisma : 30 modèles cibles, sans migration ni seed ;
- `OtpChallenge` : contexte serveur borné, hash OTP et appareil, preuve de mot
  de passe, password hash pending et liens client/session selon le `purpose` ;
- `ArtistSettlement` : agrégat par artiste et Settlement, séquence `BigInt`,
  prédécesseur unique du même artiste, carry entrant/sortant et totaux exacts ;
- `ArtistEarning` : base et BPS gelés, numérateur exact, lien composite vers le
  même agrégat, Settlement, commande, ligne, contenu et artiste ;
- types TypeScript : générés depuis OpenAPI, avec numérateurs et séquences
  sérialisés sans perte ;
- préconditions : premier carry nul, prédécesseur immédiat verrouillé, même
  artiste, consommation unique, bornes, conservation et compensation seulement.

## Fichiers du lot

L’instantané local validé contient 40 fichiers : les 39 fichiers S1.1 préservés
pendant M0.3 et le présent rapport obligatoire.

### API, contrats et preuves exécutables

- `apps/api/prisma/schema.prisma`
- `docs/api/openapi.yaml`
- `packages/contracts/README.md`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/generated/audio-pilot.ts`
- `packages/contracts/test/boundary.test.mjs`
- `scripts/openapi/artist-earning-allocation.mjs`
- `scripts/openapi/generate-contract-types.mjs`
- `scripts/openapi/validate-openapi.mjs`
- `scripts/openapi/validate-openapi.test.mjs`

### UX mobile et administration

- `apps/mobile/lib/src/design_system/kora_actions.dart`
- `apps/mobile/lib/src/design_system/kora_audio.dart`
- `apps/mobile/lib/src/design_system/kora_badges.dart`
- `apps/mobile/lib/src/design_system/kora_design_system.dart`
- `apps/mobile/lib/src/design_system/kora_experience_state.dart`
- `apps/mobile/lib/src/design_system/kora_forms.dart`
- `apps/mobile/lib/src/design_system/kora_payment.dart`
- `apps/mobile/lib/src/design_system/kora_player.dart`
- `apps/mobile/lib/src/theme/kora_colors.dart`
- `apps/mobile/lib/src/theme/kora_theme.dart`
- `apps/mobile/test/audio_pilot_design_system_test.dart`
- `apps/mobile/test/golden_test.dart`
- `apps/mobile/test/goldens/audio_pilot_gallery_341.png`
- `apps/mobile/test/support/audio_pilot_gallery.dart`
- `packages/ui/README.md`
- `packages/ui/src/actionable-error.tsx`
- `packages/ui/src/audio-admin.test.tsx`
- `packages/ui/src/content-form.tsx`
- `packages/ui/src/content-status-badge.tsx`
- `packages/ui/src/index.ts`
- `packages/ui/src/media-processing-status.tsx`
- `packages/ui/src/publication-checklist.tsx`
- `packages/ui/src/styles.css`

### Architecture, gouvernance, sécurité et traçabilité

- `docs/architecture/SLICE_1_1_AUDIO_PILOT_CONTRACT_AND_DATA_MODEL.md`
- `docs/governance/DECISION_LOG.md`
- `docs/qa/REQUIREMENTS_TRACEABILITY_MATRIX.md`
- `docs/qa/SLICE_1_1_CONTRACT_DATA_UX_GATE_REPORT.md`
- `docs/roadmap/MVP_EXECUTION_PLAN.md`
- `docs/security/THREAT_MODEL.md`
- `docs/ux/SLICE_1_1_AUDIO_EXPERIENCE_SYSTEM.md`

### Diff local exact S1.1-R1

R1 modifie exactement 23 des 40 fichiers S1.1 publiés, sans nouveau fichier :

- `apps/api/prisma/schema.prisma`
- `apps/mobile/lib/src/design_system/kora_actions.dart`
- `apps/mobile/lib/src/design_system/kora_audio.dart`
- `apps/mobile/lib/src/design_system/kora_badges.dart`
- `apps/mobile/lib/src/design_system/kora_experience_state.dart`
- `apps/mobile/lib/src/design_system/kora_forms.dart`
- `apps/mobile/lib/src/design_system/kora_payment.dart`
- `apps/mobile/lib/src/design_system/kora_player.dart`
- `apps/mobile/lib/src/theme/kora_colors.dart`
- `apps/mobile/lib/src/theme/kora_theme.dart`
- `apps/mobile/test/audio_pilot_design_system_test.dart`
- `docs/api/openapi.yaml`
- `docs/architecture/SLICE_1_1_AUDIO_PILOT_CONTRACT_AND_DATA_MODEL.md`
- `docs/governance/DECISION_LOG.md`
- `docs/qa/REQUIREMENTS_TRACEABILITY_MATRIX.md`
- `docs/qa/SLICE_1_1_CONTRACT_DATA_UX_GATE_REPORT.md`
- `docs/roadmap/MVP_EXECUTION_PLAN.md`
- `docs/security/THREAT_MODEL.md`
- `docs/ux/SLICE_1_1_AUDIO_EXPERIENCE_SYSTEM.md`
- `packages/contracts/README.md`
- `packages/contracts/src/generated/audio-pilot.ts`
- `scripts/openapi/validate-openapi.mjs`
- `scripts/openapi/validate-openapi.test.mjs`

Les 17 autres fichiers de la Draft PR, dont le golden PNG, restent strictement
inchangés. Aucun manifeste, lockfile, workflow, dépendance, migration ou code
applicatif runtime n’entre dans R1.

## Validations réelles

Environnement : Node `22.18.0`, npm `10.9.3`, Flutter `3.44.1`, Dart `3.12.1`,
Prisma `7.9.1` et Docker Engine `29.4.2`.

Les validations complètes R1 ci-dessous ont été obtenues une seule fois avant
les corrections causales des contre-revues finales. Elles n’ont pas été rejouées
lorsque leur périmètre n’était pas affecté.

| Contrôle R1 complet       | Résultat                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| OpenAPI/Prisma/auth ciblé | PASS — 93/93                                                                                           |
| Flutter ciblé             | PASS — 11/11                                                                                           |
| scanner officiel          | PASS — 334 fichiers                                                                                    |
| outillage complet         | PASS — 163/163                                                                                         |
| Prisma validate/generate  | PASS                                                                                                   |
| lint et typecheck globaux | PASS                                                                                                   |
| tests globaux             | PASS — Web 10, Admin 13, API 22, Contracts 2, Config 1, UI 11 et Flutter 22                            |
| builds npm applicables    | PASS — Web, Admin, API, Contracts, Config et UI                                                        |
| APK Flutter debug         | PASS — 187 955 067 octets ; SHA-256 `328B48853226F4E94E65342056B274FD1498861447AEDAF5118D28481C2AB2EB` |
| licences                  | PASS — 1 129 paquets, 0 non déclaré, 0 non approuvé                                                    |

### Relances ciblées après contre-revue

| Contrôle directement affecté                     | Résultat                                                      |
| ------------------------------------------------ | ------------------------------------------------------------- |
| format Dart des 4 fichiers concernés             | PASS — aucune dérive                                          |
| analyse Flutter ciblée sur 4 fichiers            | PASS — aucune anomalie                                        |
| test Flutter `audio_pilot_design_system_test`    | PASS — 11/11 ; états/actions et absence de doublon prouvés    |
| format OpenAPI, validateurs, Prisma et documents | PASS                                                          |
| tests OpenAPI/Prisma/auth/enveloppes             | PASS — 147/147                                                |
| `npm run openapi:validate`                       | PASS — 32 chemins, 85 schémas, 14 invariants et 30 modèles    |
| génération puis contrôle de dérive des types     | PASS — types régénérés depuis le contrat final, aucune dérive |
| Prisma validate/generate                         | PASS — schéma cible valide, client Prisma 7.9.1 généré        |
| lint et typecheck du workspace Contracts         | PASS                                                          |
| scanner officiel final                           | PASS — 334 fichiers, historique inclus                        |
| Prettier, chronologie et références relatives    | PASS — 8 documents, 9 références, 0 brisée                    |
| `git diff --check`                               | PASS                                                          |

Les deux installations npm déterministes, audits réseau, `npm ls --all`, suites
globales, six builds, APK, licences et infrastructure n’ont pas été relancés
après les corrections ciblées finales. Aucun manifeste, lockfile, dépendance,
workflow ou golden n’a changé ; ces preuves publiées ou acquises avant la
contre-revue restent applicables. Le contrat TypeScript a en revanche été
régénéré parce que son OpenAPI source a changé, puis sa dérive a été contrôlée.

Empreintes de lockfiles, inchangées avant et après les validations :

- `package-lock.json` :
  `E47CEA6A6853ABBDEB5A82A1D537C9C9DA92486D7A9F2EC72891A7A4101E2044` ;
- `apps/mobile/pubspec.lock` :
  `44C54ADEE80B74F8860D7CC87158FEDAD520F60DB0BD918D8D19BEF5A8326B7E`.

## Revues indépendantes

Les trois revues et leurs contre-vérifications ont été menées en lecture seule.

1. **Architecture, OpenAPI et Prisma — PASS après correction.** La revue a
   demandé le contexte serveur persistant de chaque challenge OTP, les clés
   candidates composites manquantes, l’inventaire exact des opérations, la
   fermeture des schémas publics d’authentification et des enveloppes. Les
   relations client/session/appareil/commande et leurs suppressions `Restrict`
   sont maintenant imposées par le validator et ses tests négatifs. La
   contre-revue confirme aussi la dérive nulle des types générés, l’absence de
   migration ou de runtime et la cohérence des 30 modèles cibles.
2. **Finance, sécurité et intégrité — PASS après deux corrections.** La première
   revue a démontré des variantes anonymes sur les classes de sécurité, des
   ajouts sur les routes health, des alias d’oracle d’existence de compte et des
   surfaces d’erreur trop extensibles. Une première contre-revue a ensuite
   reproduit quatre contournements du schéma public `Session` : `password`,
   `credentialHash`, `refreshTokenDigest` et `passwordHashV2`. Les opérations,
   codes publics, détails d’erreur, schémas et enveloppes auth sont désormais
   exacts ; la détection couvre les variantes `hash`/`digest`. Les quatre
   reproductions sont rejetées et la contre-revue finale ne relève plus aucun
   finding.
3. **UX, accessibilité, gouvernance et périmètre — PASS après correction.** La
   revue a demandé que l’état annoncé des lecteurs soit dérivé de `isPlaying`,
   que le lecteur vide sépare contenu statique et action, que les deux états du
   radio soient prouvés et que les seuils typographiques soient centralisés. Les
   tests Flutter confirment l’absence d’annonce dupliquée, les actions accessibles
   et les états radio exclusifs. La contre-revue confirme également les 23
   fichiers R1, les comptes OpenAPI, le report formel d’`AppLocalizations` et la
   cohérence roadmap/Threat Model.

La suite ciblée finale conclut **147/147** et le validator réel conclut PASS sur
32 chemins, 85 schémas, 14 invariants et 30 modèles cibles.

Aucun désaccord subsiste entre les revues et la vérification personnelle. Tous
les findings démontrés ont été corrigés dans le périmètre S1.1 et contre-vérifiés.

## Limites et éléments non exécutés

- build iOS : **NON EXÉCUTÉ** sur Windows, jamais déclaré PASS ;
- aucune migration Prisma, transaction, base métier, route, fournisseur de
  paiement, paiement réel, secret, release ou déploiement : hors périmètre et
  volontairement non exécuté ;
- aucune validation sur appareil physique ni infrastructure de production :
  hors périmètre S1.1.

## État Git lors de la validation locale du 2026-09-07

- branche : `feat/s1-1-audio-contract-data-ux-gate` ;
- base/HEAD de l’instantané :
  `3b05bfd83a65ab552c6c08f114b8ee0261103f30` ;
- l’index était vide, sans conflit ni opération Git active ;
- aucun commit, push ou changement GitHub S1.1 n’avait encore été effectué ;
- S1.2 n’avait pas été commencé.

Ces constats sont la preuve historique de prépublication. L’état Git et GitHub
postérieur fait foi dans l’historique Git et dans la Draft PR correspondante.

## Verdict de l’instantané historique prépublication S1.1-R1 du 2026-09-08

**S1.1-R1 AUTH CONTRACT TENANT ISOLATION API ENVELOPES AND ACCESSIBILITY GATES
VALIDATED LOCALLY — READY FOR CTO COMMIT DECISION — PR #36 DRAFT — S1.2 NOT
STARTED**
