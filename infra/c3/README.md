# C3 A-02 — topologie locale/CI de référence

Cette topologie qualifie uniquement la frontière locale/CI : client → Nginx HTTPS → BFF Next privé → API privée mTLS. Elle ne qualifie aucun fournisseur, certificat, réseau ou hébergement de production.

## Invariants

- un identifiant de campagne et un nom de projet uniques et non `kora-plus-local` sont obligatoires ;
- seul Nginx publie un port hôte ; BFF, API, PostgreSQL et Redis restent sur des réseaux internes séparés ;
- Nginx ne lit aucun `Forwarded`, `X-Forwarded-*`, `X-Real-IP`, PROXY protocol ou configuration real-ip ;
- Nginx ne relaie aucun header entrant par défaut et reconstruit une allowlist fermée ;
- API et BFF vérifient la CA, la période, l’EKU, le SAN unique exact et l’empreinte leaf attendue ;
- toutes les clés sont éphémères, hors dépôt et montées en lecture seule uniquement dans leur détenteur ;
- les images officielles Node, Nginx, PostgreSQL et Redis sont épinglées par digest ;
- toute ressource porte les labels de campagne. Aucun prune ou cleanup global n’est permis.

## Ordre de campagne

1. Créer hors dépôt un répertoire de campagne neuf, permissions restreintes, et les secrets de 43 caractères attendus par le provisionneur.
2. Générer une CA d’entrée, une CA API et une CA client distinctes. Générer :
   - Nginx : SAN DNS unique `admin.c3.invalid`, EKU `serverAuth` ;
   - API : SAN DNS unique `api.c3.internal`, EKU `serverAuth` ;
   - BFF : SAN URI unique `spiffe://kora.local/c3/admin-bff`, EKU `clientAuth`.
3. Archiver hors dépôt seulement certificats publics, SAN/EKU, dates et SHA-256 DER. Ne jamais archiver les clés privées.
4. Exporter toutes les variables `KORA_C3_*` par un objet d’environnement explicite, puis exécuter `docker compose config` et vérifier projet, source, secrets, port et labels avant toute création.
5. Démarrer seulement `postgres`, `redis` et `build`. Attendre leurs résultats terminaux.
6. Appliquer dans `postgres`, en ordre lexical, les migrations `apps/api/prisma/migrations/*/migration.sql`, puis exécuter `/usr/local/bin/kora-provision-postgresql-runtime.sh`. Ne réparer aucune base partiellement migrée.
7. Démarrer le profil `runtime`, puis le profil `probes`. Vérifier les identités reçues par chaque processus avant les probes métier.
8. Exécuter les refus TLS, SAN/empreinte et provenance, puis les probes de buckets depuis `probe-a` et `probe-b`, en archivant leurs adresses Docker réellement observées.
9. Exécuter séparément le navigateur réel HTTPS avec confiance ciblée dans la CA d’entrée. `ignoreHTTPSErrors` global est interdit comme preuve.
10. Comparer l’inventaire étranger après chaque étape structurante. Au cleanup, retirer seulement les ressources portant le projet et l’identifiant exacts de la campagne.

Les échecs de handshake TLS n’ont pas de réponse HTTP. Les refus applicatifs d’identité exacte ou de provenance retournent une réponse minimale 403 `no-store`. Ces deux classes de preuve doivent rester distinctes.
