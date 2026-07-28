# KORA+ Final — Decision Log

Ce journal conserve les décisions acceptées et distingue leur nature. Les
instructions d’exécution historiques restent traçables mais non exécutables.

## 2026-07-25 — Clôture de spécification

Owner : Mohamed Sogoba
Autorité technique : ChatGPT Work
Statut : **Accepted**

- Le Cahier des charges V4 reste l’autorité produit.
- Les ADR acceptés corrigent les spécifications d’ingénierie, mobile et
  back-office de rang inférieur.
- La billetterie sort du MVP et passe en V2.
- L’identité MVP est le téléphone vérifié ; e-mail facultatif et aucun social
  login.
- Les invités atteignent Home ; l’authentification intervient sur action
  protégée.
- Seule l’administration publie des contenus au MVP.
- `artistRevenueShareBps=2000` signifie une part artiste de 20 %.
- La base artiste d’une vente est le revenu éligible réglé après taxes et
  remboursements ; les frais fournisseur restent un coût plateforme.
- « Soutenir l’artiste » transfère le net collecté sans commission KORA+
  supplémentaire au MVP.
- Une Order accepte plusieurs PaymentAttempts immuables.
- Toute correction financière utilise des écritures compensatoires équilibrées.
- Un remboursement total ciblé révoque le droit correspondant, compense vente
  et revenu, et baisse la dépense nette sans déclasser le palier atteint.
- Les previews anonymes existent uniquement dans l’application mobile.
- Les URLs sources média restent privées ; seuls des descriptors signés courts
  sont transmis.
- Publication éditoriale et processing média sont deux états distincts.
- Un contenu archivé reste accessible à ses acheteurs.
- Les webhooks sont durablement enregistrés avant acquittement.
- Les audits critiques sont transactionnels et append-only en base.
- L’offline utilise chiffrement lié à l’appareil et licences renouvelables.
- Favoris et playlists simples restent avant bêta ; avis et notes passent en V2.
- Le back-office est clair uniquement au MVP.
- Le support est masqué/read-only et ne peut muter finance, sécurité ou contenu.
- Le benchmark comprend 16 captures.
- Les paiements réels restent bloqués par contrats, stores et revue légale.

## Corpus des 40 arbitrages préservés

Les entrées `REG-01` à `REG-40` du
[Specification Alignment Register](SPEC_ALIGNMENT_REGISTER.md) sont des
décisions existantes, pas de nouvelles décisions S0.1. Elles restent toutes
fermées.

| IDs | Objet | Statut |
|---|---|---|
| REG-01 à REG-09 | Dépendances AdminLTE, sécurité/session admin, dashboard, audit, contrats et configuration | Accepted |
| REG-10 à REG-16 | Terminologie, performance/tests, sessions, artiste, guest-first et identité | Accepted |
| REG-17 | Billetterie | Deferred V2 |
| REG-18 à REG-29 | Paiements, ledger, revenus, preview, média, archive, webhooks, sessions, audit, offline et bibliothèque | Accepted |
| REG-30 | Avis et notes | Deferred V2 |
| REG-31 à REG-39 | Notifications, checkout, thème, RBAC, flows, benchmark, revenus, remboursements et capture | Accepted |
| REG-40 | Paiements réels et distribution | Contract gate |

La décision détaillée, la justification, l’impact, les sources, les ADR et la
date de chaque ID sont conservés dans le registre canonique.

## 2026-07-25 — Ancienne autorisation d’exécution

Statut : **Historique — non exécutable**

- L’ancien Sprint 0B Architecture Alignment and Foundation Repair avait été
  autorisé.
- L’ancien travail de repository devait être préservé et audité.
- Des échecs Flutter historiques pouvaient être réparés.
- Les comportements paiement, ledger, offline et publication média restaient
  interdits avant validation des contrats.

Ces quatre décisions d’exécution sont remplacées par
`CLEAN_ROOM_SCOPE.md` et le Master Execution Blueprint du 2026-07-28. Elles ne
créent aucune tâche dans `KORA-PLUS-FINAL`.

## 2026-07-28 — Gouvernance S0.1

| ID | Nature | Décision | Autorité | Statut |
|---|---|---|---|---|
| DEC-S0.1-01 | Technique | La seule implémentation active est une clean room ; aucun ancien code n’est réutilisable. | ChatGPT Work / Clean-room Scope | Accepted |
| DEC-S0.1-02 | Technique | La racine unique est `KORA-PLUS-FINAL`. | ChatGPT Work / Product Owner | Accepted |
| DEC-S0.1-03 | Technique | Baseline : Git disponible, Node 22.18.0, npm 10.9.3, Flutter 3.44.1 et Dart 3.12.1. | Master Blueprint | Accepted |
| DEC-S0.1-04 | Technique | Git est initialisé localement uniquement dans la racine validée. | Product Owner | Accepted |
| DEC-S0.1-05 | Technique | La branche stable initiale est `main`. | Product Owner | Accepted |
| DEC-S0.1-06 | Technique | Le premier commit local S0.1 est l’unique exception de bootstrap, uniquement avec identité Git préexistante et contrôles conformes. | Product Owner | Accepted |
| DEC-S0.1-07 | Réservée PO | Aucun remote, push, tag ou compte GitHub n’est créé sans nouvelle autorisation. | Product Owner | Accepted |
| DEC-S0.1-08 | Technique | Docker demeure `BLOCKER FOR SPRINT 0.4 — NOT BLOCKING SPRINT 0.1`. | Master Blueprint / Lot 00B | Accepted |

## Catégories d’autorité

- **Produit** : vision, économie, marque, contrats et périmètre irréversible ;
  décision réservée au Product Owner.
- **Technique** : architecture, sécurité et séquencement dans les limites
  approuvées ; arbitrage ChatGPT Work.
- **Exécution** : opérations autorisées par le prompt actif ; Codex exécute et
  produit les preuves.
- **Réservée PO** : aucune valeur ou identité n’est inventée pour contourner
  l’absence d’une décision.
