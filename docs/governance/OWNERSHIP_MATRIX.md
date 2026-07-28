# KORA+ Final — Matrice de responsabilités

Statut : **APPROUVÉ POUR S0.1**

| Rôle | Autorité et responsabilités | Limites |
|---|---|---|
| Mohamed Sogoba — Product Owner | Vision, business, marque, contrats, dépenses importantes, périmètre irréversible et validation visuelle finale | N’a pas à combler les lacunes techniques |
| ChatGPT Work — CTO & AI Program Director | Architecture, arbitrage technique, prompts de lots, source de vérité et Go/No-Go | Ne remplace pas l’autorité produit réservée |
| Codex — orchestrateur | Intégration, Git, fichiers racine, exécution et preuves | Ne redéfinit pas le produit ; s’arrête si une autorité manque |
| Spécialistes | Travail indépendant dans des périmètres explicitement disjoints ; demandes d’intégration au fil principal | Ne modifient pas les fichiers racine sans attribution ; validators en lecture seule |
| Claude — documentation/design | Analyse documentaire et design longue, sous forme de proposition | Tout livrable reste un draft audité avant exécution ; aucun ordre direct à Codex |
| QA, sécurité et Design QA | Validation indépendante et constats | Ne corrigent pas silencieusement les défauts |

## Propriété des zones

- Fichiers racine et intégration : Codex orchestrateur.
- Architecture, ADR et contrats : propriétaire nommé par le lot, après
  arbitrage technique.
- Application mobile, API/data, web/admin et infrastructure : propriétaires
  distincts lorsque les périmètres sont autorisés.
- Documents officiels immuables : lecture seule.

Aucun identifiant GitHub, compte externe ou adresse e-mail n’est défini dans
cette matrice.
