# S1.2-03C3 — Revue tierce, licences et supply-chain

Statut : **GO TECHNIQUE LOCAL DU GRAPHE EXACT — JURIDIQUE ET PRODUCTION NON
QUALIFIÉS — CANDIDAT LOCAL NON PUBLIÉ**

Date : 2026-10-31

Cette revue porte sur les dépendances ajoutées ou directement mobilisées par
C3 et sur l'image Nginx de la topologie A-02. Elle ne vaut ni approbation
juridique générale, ni qualification d'un fournisseur ou d'une image de
production.

## Identités npm qualifiées

| Paquet                            | Version | Licence déclarée | Intégrité du lockfile                                                                             |
| --------------------------------- | ------- | ---------------- | ------------------------------------------------------------------------------------------------- |
| `@playwright/test`                | 1.64.1  | Apache-2.0       | `sha512-IaYGml/nSOiZWROfPtuIL7neuu9qDOZ3TNvNljUIrhDMxiGTgPjzj/g9p9RxpS2tSepPDRY+UwAaEeiKtUvIAg==` |
| `playwright`                      | 1.64.1  | Apache-2.0       | `sha512-HCrVhHr5QQuwYoswEUGTb7gGp522yflbv/ST8nF4sFWGuLjQCt17Q/EubpGGSNKYn1tsTCPZxqHhHCfVURu7UA==` |
| `playwright-core`                 | 1.64.1  | Apache-2.0       | `sha512-BC4s8y6SEVA6Q1rSxZTto8hI1KUI3xXlHGZgvGqP4IqPdI/a6FX9H29IDNz7vKo9l21b6LfYosScPL6M3xxyDQ==` |
| `@axe-core/playwright`            | 4.14.0  | MPL-2.0          | `sha512-SGUhG5PIHd2eMdpgBF2PyQLOhX+qyDR2PT4cmoS4Qk2ak+jX/rrSvst9l0PGv5WTHolKpUMvVmoHpr4cZgf1RQ==` |
| `axe-core`                        | 4.14.0  | MPL-2.0          | `sha512-9WTZxEjsZ7b13TH8JPmbV2z8CHbl80/2hm3XPEG4JgNdQLK81IBRXmSxHfMAOkSqQeRxT/0dwNDz2GOm3zzpcQ==` |
| `jsqr`                            | 1.4.0   | Apache-2.0       | `sha512-dxLob7q65Xg2DvstYkRpkYtmKm2sPJ9oFhrhmudT1dZvNFFTlroai3AWSpLey/w5vMcLBXRgOJsbXpdN9HzU/A==` |
| `typescript`                      | 5.9.3   | Apache-2.0       | `sha512-jl1vZzPDinLr9eUt3J/t7V6FgNEw9QjvBPdysz9KfQDD41fQrC2Y4vKQdiaUpFT4bXlb1RHhLpp8wtm6M5TgSw==` |
| `concurrently`                    | 10.0.6  | MIT              | `sha512-qgICXXFp2/3nAebRLmxcINKEXM1mLK3ij/y31P02VTs/KIkddIeC05n73DxOXsXMB9LFSqNU1/na3lDlOhcbIw==` |
| `minimatch`                       | 11.0.1  | BlueOak-1.0.0    | `sha512-t+Vn6DX4wPCxS23y03C0uhF7S1jpi1GfqPrnlEipCJaA2ykiNbMkVlDutZtmvLfRcUN6R8AYVlzTsQrT4RZoLQ==` |
| `@isaacs/nonrecursive-glob-match` | 1.0.3   | BlueOak-1.0.0    | `sha512-SI7kyKHq4XXDRozw+r9GlRZkia1ZkFrpLW98r2IC2Bpr8YkFGE3fvjzmxCG0x78A++69HmDNrDvSMYBZmHGpKA==` |

Textes locaux examinés :

| Artefact                         | Octets | SHA-256                                                            |
| -------------------------------- | -----: | ------------------------------------------------------------------ |
| `@playwright/test/LICENSE`       | 11 601 | `45873d00a0dd243596deb4aa23b2493b3d1f0671921bf2538ea431d7380220eb` |
| `@playwright/test/NOTICE`        |    254 | `6d602191187b35b9b01d2cffa01c8469c2c8d9de8a96f1bf868e0f264f51c81d` |
| `@axe-core/playwright/LICENSE`   | 15 920 | `812e9d96e900a093ae4d1d3f22c5f82f568a0a0461c3007a99d00573d41c5461` |
| `axe-core/LICENSE`               | 15 921 | `af175b9d96ee93c21a036152e1b905b0b95304d4ae8c2c921c7609100ba8df7e` |
| `axe-core/LICENSE-3RD-PARTY.txt` |  3 766 | `4f8563870d0fca38bbc3e00b6f670cb7fa9f380ba9f26a7f7d1184a6b18b1653` |
| `jsqr/LICENSE`                   | 11 358 | `c6596eb7be8581c18be736c846fb9173b69eccf6ef94c5135893ec56bd92ba08` |

Le gate officiel de licences passe au code 0 : 825 paquets, zéro licence non
déclarée et zéro licence non approuvée. Le gate de signatures passe au code 0 :
823 signatures de registre et 191 attestations vérifiées. Nest CLI,
`fork-ts-checker-webpack-plugin`, `deepmerge`, `cosmiconfig` et `tsc-watch` sont
absents du graphe sélectionné.

## Image Nginx A-02

La configuration référence exactement :

`nginx:1.31.8-alpine3.24-slim@sha256:f45171d36c76a8b2f5ef97108a3a8a2294248a6578a0a180edc2d78f7d2edc26`

Le manifeste `linux/amd64` observé porte le digest :

`sha256:f9238a4aacf18df0f059cf0389490fc2e876352f75d019f475a48e8765576f24`.

L'attestation rattachée à cet enfant est
`sha256:90851f80924162c1f75e41435111a432557889cac88613844ba27fe508ff5245`.
Son SBOM SPDX 2.3, créé par Docker Scout 1.18.1/BuildKit, inventorie 26 paquets
et 808 relations, dont Nginx `1.31.8-r1`, BusyBox `1.37.0-r31`, musl
`1.2.6-r3` et OpenSSL `3.5.9-r0`. La provenance SLSA identifie Docker Library
et le commit source `6fabb4c960a02a1e576d2789974c45f4cd2aa854` pour `linux/amd64` ; elle
déclare `reproducible=false`.

Les licences déclarées couvrent notamment MIT, GPL-2.0, GPL-3.0, LGPL,
MPL-2.0, Apache-2.0, BSD et Zlib. Chaque `licenseConcluded` demeure
`NOASSERTION` : l'inventaire n'est pas une approbation juridique de l'image.
Docker Scout 1.20.4 relève brutement `CVE-2026-107891` sur
`musl@1.2.6-r3` avec une borne générique/edge `r6`. Pour l'enfant
`linux/amd64` exact de l'index qualifié, le tracker officiel Alpine
3.24/main classe `1.2.6-r3` corrigé. Le signal Scout est donc un faux positif
d'affectation par confusion de branche, sans waiver ni suppression du résultat
brut. Le SBOM 26/808, ses `licenseConcluded=NOASSERTION`, la provenance
`reproducible=false` et l'absence de qualification production restent
inchangés.

## Audits frais du candidat

| Gate                                     | Code | Résultat           |
| ---------------------------------------- | ---: | ------------------ |
| `npm audit --audit-level=low`            |    0 | zéro vulnérabilité |
| `npm audit --omit=dev --audit-level=low` |    0 | zéro vulnérabilité |

La vulnérabilité production historique concernait `qs@6.16.0`, advisory
`GHSA-6pq8-jhm2-2vcw`. Le candidat courant utilise `qs@6.16.1`, version et
intégrité exactes sous `body-parser@2.4.0`, `express@5.2.1` et
`superagent@10.3.0`. Installation propre, `npm ls`, scanner, API et audit
production qualifient cette correction.

Le candidat final remplace la chaîne Nest CLI par `tsc@5.9.3` pour le build et
`concurrently@10.0.6` pour le watch borné. Les sorties de build sont
byte-identiques sur 216 fichiers et le watch/restart est qualifié. Le retrait
est causal : aucun `audit fix --force`, downgrade, override global ou version
supposée n'est appliqué.

## Remédiation C3-PUB-SC-01

Le premier préflight de publication a détecté
`GHSA-g3hv-75wg-m249` sur l'unique installation de développement
`minimatch@10.2.6` et a bloqué avant indexation. Le candidat sélectionné
utilise l'override racine exact `minimatch@11.0.1`, moteur publié
`18 || 20 || >=22`, et la transitive unique
`@isaacs/nonrecursive-glob-match@1.0.3`. Les deux paquets déclarent
`BlueOak-1.0.0`. Le lockfile est produit par npm sans édition manuelle,
`--force` ni `--legacy-peer-deps`.

Le scanner protège l'unique emplacement physique, les sept parents historiques
de minimatch et leurs ranges déclarés, `brace-expansion@5.0.12`, le seul
parent de nonrecursive, les URL de registre, intégrités, licences, moteurs et
graphes exacts. Installation propre, `npm ls --all`, audits complet et
production, signatures et licences passent. Sept artefacts WASM optionnels
restent signalés `extraneous` par npm 10, sans invalidité, peer cassée,
`ELSPROBLEMS` ou code non nul.

La compatibilité est démontrée pour les configurations ESLint KORA+ actives.
Les options dormantes `import/no-internal-modules:forbid` et
`react/jsx-pascal-case:ignore` restent incompatibles et interdites jusqu'à
qualification séparée. Cette revue ne présente donc pas minimatch 11 comme
compatible avec toutes les capacités des plugins installés.

## Historique des candidats rejetés

Le candidat post-`qs` précédent reste NON-PASS : audit complet code 1, trois
occurrences low de `deepmerge@4.3.1` via
`@nestjs/cli@11.0.24 -> fork-ts-checker-webpack-plugin@9.1.0`, sans version
upstream corrigée. Le candidat `tsc-watch` reste NON-PASS pour la licence non
déclarée de `map-stream`. Les erreurs d'installation et le premier NON-PASS du
scanner sur le parent historique `cosmiconfig` restent archivés et ne sont pas
réinterprétés comme des vulnérabilités nouvelles.

Le BLOCK de publication sur `minimatch@10.2.6`, ainsi que les premières
tentatives npm et le candidat non formaté de SC-01, restent également
historiques ; ils ne sont pas réinterprétés comme des vulnérabilités
supplémentaires.

## Décision

Le graphe npm exact et l'affectation du digest Nginx obtiennent un **GO
TECHNIQUE LOCAL**. Les audits, licences npm, signatures, SBOM et provenance sont
concluants dans leur portée. Ce verdict ne ferme ni les
`licenseConcluded=NOASSERTION`, ni l'analyse juridique de l'image, ni une
qualification de production ou de fournisseur. La politique OSS générale
demeure différée et aucun fournisseur de production n'est qualifié.
