# Revue des licences tierces — Sprint 0.3

Date de qualification : 2026-07-29
Date de décision du gate : 2026-07-30
Source : `package-lock.json` et manifestes installés
Statut : **QUALIFIÉ — LEGAL/LICENSE GATE APPROVED FOR S0.3 MERGE**

Cette analyse décrit les chemins, usages et mesures de conformité identifiés.
Elle ne constitue pas un avis juridique. Le Product Owner atteste qu’un juriste
a validé la situation des licences et notices tierces actuellement verrouillées
pour S0.3 et autorise le passage Ready puis la fusion de la PR S0.3. Aucun nom,
document confidentiel, numéro de dossier ou citation juridique n’est enregistré.

Cette approbation est strictement limitée au périmètre S0.3 actuel. Elle ne vaut
pas autorisation générale pour une future dépendance, modification de
packaging, distribution, release ou exploitation commerciale.

## Matrice de qualification

| Composant | Licence déclarée | Chemin | Présence et distribution envisagée | Mesures ou obligations à valider | Remplacement étudié |
|---|---|---|---|---|---|
| `@img/sharp-libvips-*@1.3.2` (10 variantes de plateforme) | LGPL-3.0-or-later | `next@16.2.12` → `sharp@0.35.3` → binaires libvips optionnels | Production optionnelle. Seule la variante de la plateforme cible est installée/embarquée. Non incluse dans l'APK Flutter ni dans les bundles navigateur. Peut être présente dans une image serveur Node distribuée. | Si un binaire est distribué : conserver les notices et la licence, identifier la version/source correspondante, vérifier la possibilité de remplacement/reliaison de la bibliothèque et fournir le code source des modifications LGPL éventuelles. Aucune modification locale de libvips n'est effectuée. | Désactiver/remplacer le traitement d'images Next modifierait l'architecture et n'est pas justifié pour S0.3. Une installation de production peut omettre `sharp` si l'optimisation d'images n'est pas utilisée, à confirmer dans le packaging futur. |
| `@img/sharp-wasm32@0.35.3`, `@img/sharp-win32-{arm64,ia32,x64}@0.35.3` | Apache-2.0 AND LGPL-3.0-or-later, avec MIT pour wasm32 | Même chaîne optionnelle `next` → `sharp` | Entrées optionnelles du lockfile ; seule la cible compatible peut être installée. Les mêmes réserves de distribution s'appliquent au code libvips embarqué. | Conserver les textes/notices applicables et appliquer l'analyse LGPL ci-dessus à tout binaire effectivement livré. | Même décision que pour les paquets libvips. |
| `caniuse-lite@1.0.30001806` | CC-BY-4.0 | `next`/`browserslist` et plusieurs outils de compilation | Données de compatibilité consommées au build. Le package n'est pas importé par le code applicatif KORA+ ; il peut rester dans une image de build ou un déploiement Node complet. | Créditer la source `caniuse.com`, conserver un lien vers CC BY 4.0 et signaler toute adaptation attribuable à KORA+. L'attribution est ajoutée à `THIRD_PARTY_NOTICES.md`. | Retrait non retenu : dépendance transitive structurante de Next/Browserslist. |
| `axe-core@4.12.1` | MPL-2.0 | `eslint-config-next` → `eslint-plugin-jsx-a11y` → `axe-core` | Développement/lint uniquement ; non importé et non livré dans les artefacts produit. | Conserver la licence dans l'environnement de développement. Si des fichiers MPL modifiés étaient distribués, publier leurs sources sous MPL et conserver les notices. Aucun fichier tiers n'est modifié. | Remplacer l'outillage d'accessibilité réduirait la couverture QA sans avantage de distribution. |
| `lightningcss@1.33.0` et 11 variantes natives optionnelles | MPL-2.0 | `vitest@4.1.10` → `vite@8.1.5` → `lightningcss` | Développement/test uniquement ; non importé et non livré dans les artefacts produit. | Même traitement MPL : notices conservées et aucun fichier tiers modifié/distribué par S0.3. | Non retenu : changement de runner/build hors périmètre et perte de couverture. |
| `elkjs@0.11.1` | EPL-2.0 | `@prisma/client` → peer optionnel `prisma@7.9.1` → `@prisma/studio-core` → `elkjs` | Fonction de Prisma Studio/outillage. Aucun import dans l'API et aucun bundle client KORA+. Le lock npm le marque non-dev par effet de peer optionnel ; le packaging de production doit exclure Prisma CLI/Studio. | Conserver la licence dans l'outillage. Si des fichiers EPL ou leurs modifications étaient distribués, conserver les notices et fournir les sources couvertes conformément à l'EPL. Aucun fichier tiers n'est modifié. | La bonne mesure est le pruning du CLI/Studio en production, pas le remplacement de Prisma. À vérifier dans le lot de packaging. |

## Attribution CC-BY

Le manifeste installé de `caniuse-lite` désigne Ben Briggs comme auteur du
package compacté. Le dépôt amont précise que les données proviennent de
`caniuse.com`, qu'une attribution à cette source est demandée et que le site
est créé et maintenu par Alexis Deveria. La notice versionnée crédite donc à
la fois la source des données, son créateur/mainteneur et le package.

Sources de qualification :

- <https://github.com/Fyrd/caniuse>
- <https://github.com/browserslist/caniuse-lite>
- <https://creativecommons.org/licenses/by/4.0/>
- <https://www.mozilla.org/en-US/MPL/2.0/FAQ/>
- <https://www.eclipse.org/legal/epl-2.0/faq/>

## Décision attestée et portée résiduelle

Le gate juridique/licences est **APPROVED FOR S0.3 MERGE** sur attestation du
Product Owner. Les obligations suivantes restent à réévaluer pour tout futur
packaging, artefact distribué ou release :

1. l'inclusion de la notice CC-BY versionnée ;
2. la stratégie de packaging serveur qui exclut Prisma CLI/Studio et les
   variantes natives non ciblées ;
3. la checklist LGPL applicable si `sharp`/libvips est embarqué dans un
   artefact serveur redistribué ;
4. la conservation automatisée des licences/notices dans les artefacts futurs.

Cette décision autorise la fusion des fondations S0.3 sans conclure à une
compatibilité juridique générale au-delà de ce périmètre. Tous les composants
inventoriés sont utilisés sans modification locale. Aucun composant npm à
licence concernée n'est embarqué dans l'APK Flutter debug produit par S0.3.
