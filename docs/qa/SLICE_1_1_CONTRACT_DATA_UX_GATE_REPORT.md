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

- OpenAPI : 29 chemins, 35 opérations, 76 schémas et 11 invariants formels ;
- Prisma : 30 modèles cibles, sans migration ni seed ;
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

## Validations réelles

Environnement : Node `22.18.0`, npm `10.9.3`, Flutter `3.44.1`, Dart `3.12.1`,
Prisma `7.9.1` et Docker Engine `29.4.2`.

Les validations complètes ci-dessous ont été obtenues avant les corrections
ciblées issues des revues. Elles n’ont pas été relancées ensuite lorsque leur
périmètre n’était pas affecté.

| Contrôle                                 | Résultat                                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 2 × `npm ci --ignore-scripts`            | PASS — 2 × 1 135 paquets ; lockfile stable                                                             |
| `npm audit --audit-level=low`            | PASS — 0 vulnérabilité                                                                                 |
| `npm audit --omit=dev --audit-level=low` | PASS — 0 vulnérabilité                                                                                 |
| `npm ls --all`                           | PASS — code 0                                                                                          |
| `npm run licenses`                       | PASS — 1 129 paquets, 0 non déclaré, 0 non approuvé                                                    |
| `npm run security:scan`                  | PASS — 333 fichiers, historique actif, 52 immuables, 5 scripts qualifiés                               |
| Prisma format/validate                   | PASS — schéma valide                                                                                   |
| Prisma generate × 2                      | PASS — empreinte stable `8D15728BF51876D8A933DF7B3E9DF597972BE6A301EF716447D152ADD4CE62B1`             |
| `npm run openapi:validate`               | PASS — 29 chemins, 76 schémas, 11 invariants, 30 modèles                                               |
| génération des types sans `--write`      | PASS — types courants, aucune dérive                                                                   |
| tests OpenAPI/Prisma/carry ciblés        | PASS initial — 64/64                                                                                   |
| tests d’outillage complets               | PASS initial — 134/134                                                                                 |
| lint global                              | PASS — six workspaces npm + Flutter analyze                                                            |
| typecheck global                         | PASS — six workspaces npm + Flutter analyze                                                            |
| tests globaux npm                        | PASS initial — Web 10, Admin 13, API 22, Contracts 2, Config 1, UI 10                                  |
| Flutter tests et goldens                 | PASS initial — 18/18, dont galerie audio 341 px                                                        |
| builds applicables                       | PASS — Web, Admin, API, Contracts, Config et UI                                                        |
| APK Flutter debug                        | PASS — 187 955 067 octets ; SHA-256 `328B48853226F4E94E65342056B274FD1498861447AEDAF5118D28481C2AB2EB` |
| infrastructure complète                  | PASS — persistance, reset ciblé, idempotence, ressources étrangères intactes                           |
| santé API                                | PASS — live/ready, pannes et reprises Redis/PostgreSQL, PID stable, aucune fuite                       |
| `git fsck --full`                        | PASS — aucune corruption ; objets inaccessibles historiques uniquement                                 |

### Relances ciblées après findings

| Contrôle ciblé                                       | Résultat                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| format Dart des composants et du test concernés      | PASS                                                         |
| analyse Flutter ciblée sur 4 fichiers                | PASS — aucune anomalie                                       |
| test Flutter `audio_pilot_design_system_test.dart`   | PASS — 8/8 ; libellé unique et `SemanticsAction.tap` prouvés |
| format, lint et typecheck du workspace UI            | PASS                                                         |
| test UI `audio-admin.test.tsx`                       | PASS — 7/7 ; deux instances et associations ARIA vérifiées   |
| format des validateurs OpenAPI/Prisma                | PASS                                                         |
| tests OpenAPI/Prisma/carry ciblés après durcissement | PASS — 70/70                                                 |
| `git diff --check` final                             | PASS                                                         |

Les installations npm, audits, licences, suites globales, builds, APK et
vérifications d’infrastructure n’ont pas été relancés après ces
corrections ciblées. Les manifestes, lockfiles, dépendances, contrats générés
n’ont pas changé. Les changements Flutter, UI et validateurs sont strictement
localisés et couverts par les analyses et tests ciblés ci-dessus ; les résultats
complets antérieurs restent les preuves du gate initial.

Empreintes de lockfiles, inchangées avant et après les validations :

- `package-lock.json` :
  `E47CEA6A6853ABBDEB5A82A1D537C9C9DA92486D7A9F2EC72891A7A4101E2044` ;
- `apps/mobile/pubspec.lock` :
  `44C54ADEE80B74F8860D7CC87158FEDAD520F60DB0BD918D8D19BEF5A8326B7E`.

## Revues indépendantes

Les trois revues et leurs contre-vérifications ont été menées en lecture seule.
Le reviewer architecture initial ayant été interrompu par une limite d’usage,
un unique reviewer de remplacement a été utilisé comme autorisé.

1. **Architecture, OpenAPI et Prisma — PASS.** Le remplacement confirme le calcul
   `BigInt`, la conservation, la chaîne de carry, les relations composites et
   `Restrict`, ainsi que l’absence de migration, seed ou runtime financier. Les
   limites SQL/runtime futures sont explicitement documentées.
2. **Finance, sécurité et intégrité — PASS après correction.** La revue avait
   démontré que les champs critiques de `SettlementArtistAllocationAudit`
   pouvaient devenir facultatifs et que le gate ledger n’imposait pas totalement
   l’immutabilité et la relation compensatoire. Le validateur impose maintenant
   la liste `required` exacte, les types et patterns critiques,
   l’immutabilité de `LedgerTransactionGroup`/`LedgerPosting`, la compensation
   avec `Restrict` et les relations de posting avec `Restrict`. Six tests
   négatifs ont été ajoutés ; la contre-revue et les 70/70 tests sont verts,
   sans affaiblissement d’un gate antérieur.
3. **UX, accessibilité, gouvernance et périmètre — PASS après correction.** La
   revue avait trouvé les boutons Flutter de reprise masqués par
   `ExcludeSemantics` et l’identifiant ARIA fixe de `PublicationChecklist`. Les
   contenus statiques et actions sont maintenant des nœuds sémantiques distincts,
   `KoraActionButton` expose un seul libellé et une action, et les checklists
   utilisent `useId()` compatible SSR/hydratation. Les tests ciblés prouvent
   l’action accessible et l’unicité des associations ARIA.

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

## Verdict de l’instantané local du 2026-09-07

**S1.1 FINANCIAL CARRY AND DATA INTEGRITY IMPLEMENTED — CONTRACT DATA UX GATE
VALIDATED LOCALLY — READY FOR CTO COMMIT DECISION — S1.2 NOT STARTED**
