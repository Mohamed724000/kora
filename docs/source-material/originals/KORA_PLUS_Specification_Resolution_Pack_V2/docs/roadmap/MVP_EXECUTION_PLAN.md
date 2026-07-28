# KORA+ MVP Execution Plan

Status: Accepted  
Method: Vertical slices with contract-first delivery

## Sprint 0B - Architecture alignment and foundation repair

Deliver:

- source-of-truth files and ADR-001 through ADR-024;
- resolved alignment register and decision log;
- target Prisma design and pilot OpenAPI, without migrations if the schema is not approved;
- corrected requirements traceability structure;
- green Flutter foundation analyze/test/build;
- green foundation checks for web, admin and API when those applications exist;
- Docker, CI, observability and security plans aligned with the current repository.

Exit gate:

- no unresolved blocker for the audio pilot;
- no obsolete `Payment`, `previewUrl`, `commissionRatePercent` or ticketing model can enter the first migration;
- no foundation test failure remains hidden.

## Sprint 0C - Reproducible platform foundation

Deliver:

- monorepo workspaces;
- Flutter/Riverpod/GoRouter bootstrap;
- Next.js web/admin bootstrap;
- NestJS/Prisma bootstrap;
- PostgreSQL and Redis local services;
- strict lint/typecheck/test/build pipelines;
- Sentry and structured redacted logging;
- design tokens and deterministic UI test harnesses;
- minimal rights-safe seed.

Exit gate: four applications start in a documented local environment and CI is green.

## Slice 1 - Audio purchase pilot

Flow:

Home public -> catalog -> content detail -> contextual auth -> phone/OTP -> Order -> sandbox PaymentAttempt -> Entitlement -> Mes achats -> signed player -> admin content creation.

Required cross-cutting work:

- error/loading/empty/offline states;
- idempotency and webhook Inbox/Outbox;
- ledger postings and ArtistEarning in sandbox;
- RBAC and transactional audit;
- unit, integration, widget/golden and end-to-end tests.

Exit gate: one audio purchase completes end-to-end in sandbox with reconciled records and no raw media source URL.

## Slice 2 - Discovery and public web

- search, categories, trends and banners;
- artist and content SEO pages;
- deep links to mobile;
- no web playback, purchase or download.

## Slice 3 - Library and media types

- albums with ordered AlbumTrack rows;
- favorites and simple playlists;
- playback history/events;
- video, podcast and book subtype contracts;
- no reviews or ratings.

## Slice 4 - Secure offline

- encrypted chunk download and resume;
- renewable device-bound license;
- storage-low, Wi-Fi-only, pause/resume/delete and license-expiry UX;
- revocation and logout cleanup;
- device tests on Android 2-3 GB and iOS reference devices.

## Slice 5 - Artist finance

- immutable earnings subledger;
- artist support;
- available/pending/reserved balances;
- payout state history;
- statements, reconciliation and audit.

## Slice 6 - Loyalty, notifications and security operations

- monotonic tier with net qualifying spend;
- templates, delivery, push tokens and preferences;
- security center, alerts, exports and controlled recovery.

## Beta gate

- provider sandbox certification;
- 3G/weak-network and low-memory testing;
- accessibility and deterministic visual QA;
- refunds/chargebacks and reconciliation drills;
- rights, privacy and legal pages;
- backup, restore and rollback rehearsal.

## Production gate

- store distribution/payment strategy approved;
- Orange/Moov/Wave/card and SMS contracts signed;
- production secrets/KMS and environment isolation;
- penetration test, load test and independent financial reconciliation;
- tested restore, RPO/RTO, incident runbooks and staged rollout.

## V2

- ticketing and QR validation;
- reviews/ratings and social moderation;
- VdoCipher/hardware DRM for premium content;
- WebAuthn, wallet, recommendation engine and advanced multi-device policies.
