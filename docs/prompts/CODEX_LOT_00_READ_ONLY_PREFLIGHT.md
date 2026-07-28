# KORA+ Final — Codex Lot 00

## Read-only clean-room preflight

Tu es l'orchestrateur principal d'ingénierie de KORA+.

KORA+ est un produit destiné à la production, pas une démonstration. Le projet
repart de zéro dans un nouveau dossier technique nommé `KORA-PLUS-FINAL`.

## Mission unique

Effectuer le **Lot 00 — contrôle de l'environnement, des sources et de
l'intégrité clean-room**, strictement en lecture seule.

Ne commence pas le Sprint 0 et ne génère aucun code.

## Interdictions absolues

Pendant ce lot :

- ne crée, ne modifie, ne déplace et ne supprime aucun fichier ;
- n'installe et ne mets à jour aucun logiciel, package ou extension ;
- n'exécute pas `npm install`, `npm create`, `npx`, `flutter create`,
  `flutter pub get`, `flutter upgrade` ou `docker compose up` ;
- n'initialise pas Git ;
- ne crée aucun commit, remote, push ou pull request ;
- ne consulte, ne compare et ne réutilise aucun ancien projet KORA+,
  notamment `STREAM/Kora`, `KORA-REBUILD` ou une autre tentative ;
- ne demande pas d'accès en écriture hors de la racine ouverte ;
- n'utilise aucun sous-agent autorisé à écrire.

## Contrôles obligatoires

1. Confirme le chemin absolu de la racine ouverte et vérifie que son nom final
   est exactement `KORA-PLUS-FINAL`.
2. Confirme que VS Code est ouvert uniquement sur cette racine, sans ancien
   projet KORA+ ajouté au workspace.
3. Inventorie uniquement les fichiers présents sous cette racine. Utilise
   `rg --files` si disponible, sinon une alternative locale non destructive.
4. Vérifie qu'aucun ancien code d'application, `.env`, secret, migration,
   lockfile, dépendance installée, build ou configuration héritée n'est présent.
5. Localise les sources obligatoires et vérifie qu'elles sont présentes et
   lisibles :
   - `KORA_PLUS_Cahier_des_charges_V4`;
   - `KORA_PLUS_Engineering_Specification`;
   - `KORA_PLUS_Engineering_Specification_Addendum_V1.1`;
   - `KORA_PLUS_UI_UX_Design_Specification_V1`;
   - `KORA_PLUS_Back_Office_UI_UX_AdminLTE_Integration_Specification_V1.1`;
   - `KORA_PLUS_Requirements_Traceability_Matrix_V1`;
   - `KORA_PLUS_Specification_Alignment_Register_V1`;
   - `KORA_PLUS_Specification_Resolution_Pack_V2`;
   - `Screen KORA+ Benchmarket`;
   - `AI_OPERATING_MODEL.md`;
   - le mémo de résolution des contradictions V2 ;
   - `MASTER_EXECUTION_BLUEPRINT.md` approuvé, s'il a déjà été livré.
6. Vérifie sans extraction durable que le Resolution Pack V2 contient
   `ADR-001` à `ADR-024`, sans identifiant manquant ni doublon.
7. Calcule les empreintes SHA-256 des documents d'entrée afin d'établir leur
   traçabilité, sans créer de fichier de résultat.
8. Vérifie uniquement la disponibilité, le chemin et la version de :
   - Git ;
   - Node.js ;
   - npm ;
   - Flutter ;
   - Dart ;
   - Docker ;
   - Docker Compose ;
   - VS Code lorsque vérifiable.
9. Vérifie si la racine est déjà un repository Git, sans exécuter `git init`.
10. Signale chaque outil absent, version incompatible, problème de `PATH`,
    contrôle non exécutable ou document illisible. Ne corrige rien pendant ce
    lot.

## Sous-agents

Si les sous-agents sont disponibles, crée au maximum trois spécialistes
strictement en lecture seule :

1. **Documents & Source-of-Truth Auditor** — inventaire, lisibilité, hiérarchie
   et couverture des documents ;
2. **Clean-Room Integrity Auditor** — racine, absence d'héritage, secrets et
   sécurité des opérations ;
3. **Toolchain & Windows Preflight Auditor** — versions, chemins, compatibilité
   et outils manquants.

Le thread principal reste l'unique orchestrateur. Attends leurs trois rapports,
élimine les doublons et rends un seul verdict consolidé. Aucun agent ne doit
modifier un fichier.

## Conditions d'arrêt

Arrête-toi avec le verdict `NOT READY` si :

- la racine n'est pas exactement `KORA-PLUS-FINAL` ;
- l'ancien code se trouve dans la racine ;
- une source obligatoire est absente ou illisible ;
- les ADR-001 à ADR-024 ne sont pas tous disponibles ;
- l'intégrité clean-room ne peut pas être garantie ;
- un contrôle nécessiterait une action destructive ou un accès hors périmètre.

L'absence du Master Blueprint approuvé ne bloque pas ce préflight, mais bloque
l'autorisation de démarrer le Sprint 0 complet.

## Rapport final obligatoire

Réponds en français avec :

1. verdict `READY` ou `NOT READY POUR SPRINT 0` ;
2. chemin absolu, nom de racine et périmètre VS Code ;
3. tableau `document | chemin | présent | lisible | SHA-256 | statut` ;
4. état du Resolution Pack et liste des ADR trouvés/manquants ;
5. fichiers suspects ou hérités détectés ;
6. tableau `outil | version | chemin | compatibilité | statut` ;
7. commandes de diagnostic exécutées et leurs codes de sortie ;
8. contrôles non exécutés et raison ;
9. bloqueurs précis ;
10. actions manuelles simples recommandées à Mohamed, sans les exécuter ;
11. recommandation finale : autoriser ou non le Sprint 0.

Ne présente jamais un contrôle non exécuté comme réussi.

Arrête-toi après ce rapport et attends une nouvelle autorisation explicite.
