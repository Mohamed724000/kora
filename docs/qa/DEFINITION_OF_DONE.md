# KORA+ Final — Definition of Done

Statut : **BASELINE S0.1**

## Règle générale

Un travail est Done seulement si son périmètre autorisé est complet, traçable,
testé selon les contrôles applicables et accompagné de preuves reproductibles.
Un contrôle non exécuté est `NON EXÉCUTÉ`, jamais `PASS`.

## DoD d’un lot

- objectif mesurable et autorisation explicite ;
- sources, ADR et fichiers autorisés identifiés ;
- aucun dépassement de périmètre ;
- changements préexistants préservés ;
- format, lint, typecheck, tests et builds applicables réussis ;
- erreurs, états limites et rollback couverts ;
- scan de secrets et sécurité sans finding bloquant ;
- documentation vivante et traçabilité mises à jour ;
- preuves, commandes et codes de sortie rapportés ;
- validators indépendants consultés lorsque le lot l’exige ;
- écarts et validations indisponibles déclarés ;
- condition d’arrêt respectée et lot suivant non commencé.

## Qualité

- code lisible, strictement typé et sans duplication injustifiée ;
- tests unitaires pour règles et machines à états ;
- tests d’intégration pour contrats, base et services externes simulés ;
- tests UI déterministes pour états loading, vide, erreur et offline ;
- aucun test flaky masqué, désactivé ou déclaré réussi sans exécution ;
- builds reproductibles et dépendances verrouillées lorsqu’elles existent.

## Sécurité et confidentialité

- aucun secret, token, OTP, donnée privée ou URL de production versionné ;
- validation d’entrée et autorisation côté serveur ;
- moindre privilège et audit des mutations sensibles ;
- logs structurés avec redaction prouvée ;
- erreurs sans fuite d’information ;
- dépendances et licences contrôlées ;
- Threat Model et risques résiduels mis à jour.

## Accessibilité, performance et résilience

- navigation clavier/lecteur d’écran et contrastes applicables vérifiés ;
- cibles tactiles et textes lisibles sur les appareils cibles ;
- budgets de latence, mémoire et bundle mesurés lorsqu’ils existent ;
- scénarios réseau faible, reprise, timeout et retry testés ;
- aucune affirmation de performance sans mesure.

## Documentation et traçabilité

- exigence reliée à sa source, ADR, lot, preuve et statut ;
- contrat OpenAPI mis à jour avant les clients ;
- modèle Prisma validé avant migration ;
- Decision Log et registre mis à jour pour toute décision nouvelle ;
- README et guides cohérents avec les commandes réellement disponibles.

## Gates renforcés

### Paiement

- idempotency key, signature fournisseur et replay testés ;
- Webhook Inbox persistée avant acquittement ;
- Outbox transactionnelle et reconciliation ;
- doubles événements, ordre inversé, timeout et retry couverts ;
- paiement réel interdit sans contracts, stores, légal et secrets approuvés.

### Ledger et finance

- débits égaux aux crédits pour chaque groupe ;
- lignes réglées append-only ;
- corrections par compensation ;
- invariants et tests de propriétés ;
- taux et base artiste gelés par ligne ;
- retrait atomique, TOTP récent, audit et double contrôle.

### Médias

- stockage privé et droits vérifiés ;
- aucun identifiant ou URL source exposé ;
- descriptors signés courts, non persistés et non journalisés ;
- processing distinct de publication ;
- scan, droits et échec/retry testés.

### Offline

- AES-256-GCM par chunks et clé non exportable liée à l’appareil ;
- licence renouvelable, anti-replay et révocation ;
- aucun média clair au repos ;
- pause/reprise, faible stockage, réseau et nettoyage testés ;
- revue sécurité et appareils réels avant bêta.

## Preuves minimales

- liste exacte des fichiers modifiés ;
- diff contrôlé ;
- commandes et codes de sortie ;
- résultats des tests/builds ;
- scans sécurité et secrets ;
- captures ou rapports lorsque requis ;
- hash/version des artefacts de référence ;
- verdict PASS, PASS AVEC RÉSERVES ou FAIL motivé.
