# S1.1 — Système d’expérience du pilote audio

Statut : **primitives testables livrées — parcours runtime non commencé**

## Direction mobile

Le système Flutter conserve la direction sombre premium validée : fond
`#0B0B0D`, surfaces `#16161A`, accent or `#C9A15B` et texte ivoire
`#F5F1E8`. La hiérarchie reste calme, contemporaine et chaleureuse. Aucun
motif culturel distinctif, asset externe ou composition propriétaire n’est
réutilisé.

Les cinq onglets restent exactement `Accueil`, `Découvrir`, `Mes achats`,
`Lecteur` et `Compte`. Le guest-first est la règle : une authentification
contextuelle future conservera `returnTo`. Le Web public n’obtient ni preview,
ni lecture, ni transaction.

## Primitives Flutter livrées

| Besoin    | Primitive                                                       |
| --------- | --------------------------------------------------------------- |
| Catalogue | `KoraAudioCard`, `KoraArtistIdentity`, `KoraPrice`              |
| Actions   | `KoraActionButton` primaire, secondaire et destructive          |
| État      | `KoraStatusBadge`, `KoraExperienceStateView`                    |
| Auth      | `KoraMaliPhoneField` avec `+223`, `KoraOtpField` à six chiffres |
| Checkout  | `KoraSandboxPaymentMethod`, `KoraPaymentStatusPanel`            |
| Achat     | `KoraPurchaseLine`, `KoraReceiptSummary`                        |
| Lecture   | `KoraMiniPlayer`, `KoraFullPlayer`, `KoraPlayableMedia`         |

`KoraMiniPlayer` ne rend rien lorsque `media` est nul. `KoraFullPlayer` fournit
alors un état vide utile et une action vers la découverte. Aucune fixture n’est
branchée au runtime de production : les exemples nommés vivent uniquement dans
les tests et la galerie golden.

Les prix affichent immédiatement des montants entiers avec espace fine et
suffixe `FCFA`. Le composant paiement est explicitement sandbox et indique
qu’aucun débit réel n’a lieu. Les états pending, success et failed sont
expliqués par texte et symbole, jamais seulement par couleur.

Les espacements, dimensions tactiles, tailles d’icônes, rayons et métriques
typographiques des primitives sont centralisés dans `KoraSpacing`,
`KoraDimensions`, `KoraRadii` et `KoraTypography`. Les valeurs visuelles restent
inchangées ; les composants ne portent plus de dimensions ad hoc.

## Administration claire uniquement

`@kora-plus/ui` expose des primitives étroites et light-only :

- `ContentForm` et `ContentFormField` pour des formulaires lisibles ;
- `ContentStatusBadge` pour brouillon, traitement, prêt, publié, archivé et
  erreur ;
- `MediaProcessingStatus` pour la progression privée, distincte de la
  publication ;
- `PublicationChecklist` pour des préconditions actionnables ;
- `ActionableError` pour une cause sûre accompagnée d’une prochaine action ;
- `ActionButton` pour des actions principales et secondaires sans ambiguïté.

Ces primitives n’ajoutent aucune page, donnée, route ou intégration. Elles
préparent le futur parcours administrable sans introduire de faux dashboard ni
de toggle sombre.

## Accessibilité et robustesse

- actions mobiles de 48 × 48 dp minimum ;
- champs avec libellé, aide, erreur textuelle et clavier approprié ;
- sémantique explicite pour artiste, prix, statut, lecteur et paiement ;
- moyen de paiement exposé comme radio coché/non coché, mutuellement exclusif,
  avec un seul libellé et une action de sélection ;
- titre, artiste et état « en lecture/en pause » annoncés une seule fois par
  lecteur, séparément de l’action lire/pause ;
- succès paiement, erreur/chargement et hors connexion exposés comme régions
  vivantes sans dupliquer leurs descendants ;
- focus clavier admin natif renforcé par un contour de 3 px ;
- aide, erreur, obligation et invalidité reliées au contrôle admin par les
  attributs ARIA correspondants ;
- statuts avec symbole et libellé, sans dépendance à la couleur ;
- layout mobile testé à 341 px avec texte à 200 % sans overflow ;
- styles admin responsive sous 40 rem ;
- chargement Flutter statique quand `disableAnimations` est actif, plus règle
  CSS reduced-motion ;
- contrastes conçus pour WCAG AA sur les surfaces ciblées.

## Preuves visuelles

Le golden Windows
`apps/mobile/test/goldens/audio_pilot_gallery_341.png` capture à 341 px la
carte audio, l’artiste, le téléphone Mali, l’OTP, le paiement sandbox, l’état
pending, le reçu et les deux niveaux d’action. Les trois goldens de fondation
restent inchangés et continuent de vérifier le shell, les états et l’absence du
mini-lecteur.

Les tests widget vérifient en plus : format FCFA, sémantique artiste, bornes des
champs, apparition conditionnelle du mini-lecteur, état vide du lecteur,
retry, taille tactile, reduced motion, et toutes les primitives majeures à
341 px/200 %. Le golden sans mini-lecteur réaffirme les cinq onglets après
navigation. Les tests DOM admin vérifient formulaire, associations ARIA, six
statuts, progression, checklist non chromatique et erreur actionnable.

Les nouveaux libellés d’état du lecteur sont fournis par l’appelant afin que le
futur runtime puisse les obtenir de la couche de localisation. S1.1 ne prétend
pas livrer l’intégration complète `AppLocalizations` : celle-ci reste un gate du
lot runtime mobile planifié. Aucun manifeste, package de localisation ou
dépendance n’est ajouté par ce lot contract-first.

L’appelant fournit les deux libellés localisables « lecture » et « pause » ; le
composant sélectionne lui-même celui qui correspond à `isPlaying`. L’état vide,
les lecteurs actifs, leurs textes statiques et leurs actions forment des nœuds
sémantiques distincts afin d’éviter toute annonce dupliquée.

## Limites volontaires

S1.1 ne livre ni catalogue runtime, auth, checkout, upload, playback, preview,
navigation `returnTo` ni appel API. Les composants sont prêts à recevoir des
données réelles dans des lots ultérieurs, mais ne simulent aucune capacité dans
la production. La validation finale visuelle sur appareils réels reste une
responsabilité Product Owner avant bêta.
