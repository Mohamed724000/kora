# KORA+ - Codex execution prompt

## Lot 0B - Architecture Alignment and Foundation Repair

You are the Principal Engineering Execution Lead of KORA+. This is a controlled Sprint 0 lot. KORA+ is not a demo.

### 1. Current context

Target repository: `KORA-REBUILD`.

The repository has received at least a partial Flutter foundation bootstrap. Recent evidence reports:

- `apps/mobile-flutter/lib/src/design/kora_theme.dart`: `CardTheme` is incompatible with the expected `CardThemeData?`;
- `apps/mobile-flutter/test/widget_test.dart`: obsolete `MyApp` constructor reference;
- `apps/mobile-flutter/lib/src/screens/foundation_screen.dart`: bottom RenderFlex overflow around 150-161 px;
- Windows desktop run cannot build because Visual Studio desktop tooling is absent; this is not an MVP blocker;
- Chrome launch reached the debug-service connection stage.

Do not assume this evidence is still current. Reproduce it before changing code.

The attached `KORA+ Specification Resolution Pack V2` is approved. Its ADR-001 through ADR-024 are decisions, not proposals. Integrate them into the repository while preserving the original Cahier des charges V4 as product authority.

### 2. Exact objective

Bring the current repository to a verifiable, contradiction-free Sprint 0B state:

1. preserve and inventory existing work;
2. integrate the governance pack and accepted ADRs;
3. produce the target data model and pilot OpenAPI from the accepted decisions;
4. restructure traceability status fields;
5. repair only the existing Flutter foundation failures;
6. finish with green foundation validation or stop with precise evidence.

Do not implement a product feature, payment provider, ledger service, media service, offline service or admin workflow.

### 3. Source hierarchy

1. Cahier des charges V4 - product/business/scope.
2. Accepted ADRs in the Resolution Pack V2.
3. Engineering Specification plus Addendum V1.1, corrected by accepted ADRs.
4. Flutter UI/UX Specification V1, corrected by accepted ADRs.
5. Back-Office Specification V1.1, corrected by accepted ADRs.
6. Alignment Register V2.
7. Empire Afrique benchmark - behavior only.

Never copy Empire Afrique branding, palette, assets, fonts, illustrations or distinctive visual composition.

### 4. Agent organization

If sub-agents are available, use read-only agents for:

- repository and Git inventory;
- requirements/ADR consistency;
- OpenAPI/data-model consistency;
- Flutter failure reproduction.

One orchestrator owns all writes. Agents must not modify overlapping files.

### 5. Preflight and preservation

Before writing:

- locate repository root with `git rev-parse --show-toplevel`;
- record branch, HEAD and `git status --short --branch`;
- inventory with `rg --files`;
- identify all pre-existing uncommitted changes;
- locate every reference document and read it fully;
- confirm whether `apps/mobile-flutter` is only a foundation scaffold.

Never discard, reset, overwrite or hide pre-existing changes.

If `apps/mobile-flutter` is a foundation-only scaffold and `apps/mobile` does not exist, rename it to `apps/mobile` with a history-preserving Git move. If either condition is false, do not rename; report the collision and continue only with non-conflicting documentation work.

### 6. Authorized files

Documentation and governance:

- `/AGENTS.md`
- `/docs/governance/**`
- `/docs/roadmap/**`
- `/docs/qa/**`
- `/docs/security/**`
- `/docs/engineering/TARGET_DATA_MODEL.md`
- `/docs/adr/*.md`
- `/docs/api/openapi.yaml`
- `/docs/prompts/**`

Minimal Flutter foundation repair, only after reproducing failures:

- `/apps/mobile/lib/main.dart`
- `/apps/mobile/lib/src/design/**`
- `/apps/mobile/lib/src/screens/foundation_screen.dart`
- `/apps/mobile/test/**`
- equivalent paths under `/apps/mobile-flutter/**` only when the safe rename is not possible.

Root configuration may be modified only if it already belongs to the foundation and the change is necessary for existing lint/test commands.

### 7. Forbidden files and actions

- no business feature implementation;
- no provider integration;
- no Prisma migration or production schema change;
- no seed expansion beyond fixing an existing foundation-only seed reference;
- no generated client committed until OpenAPI validates;
- no AdminLTE HTML archive integration;
- no copied code from `STREAM/Kora`;
- no new dependency unless already mandated by the locked stack and strictly required for the existing foundation to validate;
- no secret, real credential, production URL or personal data;
- no destructive Git command;
- no commit or push unless Mohamed explicitly requested it in the active Codex session.

### 8. Required governance integration

Create/update:

- `AGENTS.md`
- `docs/governance/SOURCE_OF_TRUTH.md`
- `docs/governance/SPEC_ALIGNMENT_REGISTER.md`
- `docs/governance/DECISION_LOG.md`
- `docs/roadmap/MVP_EXECUTION_PLAN.md`
- `docs/qa/REQUIREMENTS_TRACEABILITY_MATRIX.md`
- `docs/qa/DEFINITION_OF_DONE.md`
- `docs/security/THREAT_MODEL.md`
- `docs/adr/ADR-001` through `ADR-024`
- `docs/api/openapi.yaml`

Use the Resolution Pack as the content baseline. Do not downgrade accepted decisions to proposed.

Traceability columns must include:

`requirement_id`, `source`, `slice`, `screen`, `api`, `model`, `role`, `test`, `spec_status`, `implementation_status`, `verification_status`, `evidence`.

No implementation may be marked complete without an actual repository artifact and passing evidence.

### 9. Target data-model decisions

Document, but do not migrate:

- `Order` one-to-many `PaymentAttempt`;
- `WebhookInboxEvent` and `OutboxEvent`;
- balanced append-only financial transaction/posting structures;
- `Refund` and allocation to OrderItem;
- immutable `ArtistEarning`, revenue basis and applied BPS;
- payout reservation and append-only status history;
- `MediaAsset`, upload and processing state separated from Content;
- anonymous `PreviewGrant` separated from Entitlement;
- Entitlement-driven library and archived access;
- `PlaybackSession`/`PlaybackEvent`;
- device-bound OfflineLicense and key version metadata;
- `AlbumTrack`;
- favorite, playlist and playlist item;
- notification/template/delivery/push-token/preference;
- admin session/TOTP/recovery;
- audited PlatformConfig and Banner.

Exclude ticketing and reviews from the MVP target model.

Use `artistRevenueShareBps`, never `commissionRatePercent`.

### 10. Pilot OpenAPI

Create a syntactically valid OpenAPI 3.1 contract for:

- public catalog, categories, search and content detail;
- phone register/login/OTP/refresh/logout and session revocation;
- Order creation;
- sandbox PaymentAttempt initiation and status;
- provider webhook ingestion contract;
- Entitlement/Mes achats and archived-item access;
- anonymous preview grant and entitled playback descriptor;
- admin auth/TOTP/reverify;
- admin content/media upload/processing/publication contracts;
- dashboard endpoints;
- audit-log read/export contracts.

Requirements:

- versioned `/api/v1`;
- standard success/error envelopes;
- cursor pagination;
- idempotency headers and conflict errors;
- no source R2 key, raw Mux asset URL or long-lived media URL;
- provider webhooks describe signature verification without embedding a real secret;
- accepted ADR vocabulary and status values.

### 11. Flutter repairs

First reproduce with the installed Flutter toolchain.

Then:

- replace deprecated/incompatible theme types with current stable API types;
- update tests to instantiate the real application root;
- remove the foundation-screen overflow using responsive scrolling/layout, not clipped content or a smaller unreadable font;
- preserve KORA+ dark premium mobile tokens: deep black, anthracite, off-white and restrained gold;
- ensure the mini-player is absent when no real media exists;
- do not create auth, catalog, checkout or player business functionality.

Windows desktop toolchain absence is informational. Validate Android-oriented Flutter code plus a supported local web test/build target when available.

### 12. Mandatory validation

Use repository tooling without installing unrelated software.

At minimum:

- `git status --short --branch`
- `git diff --check`
- `git diff --stat`
- Markdown relative-link check
- ADR and register ID uniqueness check
- YAML/OpenAPI parse and semantic validation with existing tooling
- forbidden-term scan for `commissionRatePercent`, exposed `previewUrl`, one-to-one `payment Payment?`, MVP `concert_ticket`, and MVP reviews
- secret scan with the repository's existing scanner
- from Flutter app: `flutter pub get`, `flutter analyze`, `flutter test`
- Flutter web build only if web support is already enabled and available
- existing root lint/typecheck/test/build commands for present web/admin/API applications

Do not mark an unavailable command as passed. Report it as not run with the exact reason.

### 13. Acceptance criteria

- Existing user work is preserved.
- Repository identity and baseline are recorded.
- Accepted ADR-001 through ADR-024 exist and agree with the register.
- No blocking contradiction remains for the audio pilot contract.
- Target data model and OpenAPI agree on identifiers, states and relationships.
- Ticketing and reviews are absent from MVP contracts.
- The Flutter foundation has no analyze error, failing test or overflow in its tested viewport.
- No forbidden business implementation was added.
- No raw media source URL, secret or real credential appears.
- All changed files are inside authorized scope.

### 14. Stop conditions

Stop before writes if:

- the repository is not `KORA-REBUILD`;
- the reference pack or Cahier des charges V4 is unavailable;
- uncommitted user work overlaps the same lines and cannot be preserved safely;
- the only path forward requires a destructive action;
- repository permissions cannot guarantee the authorized scope.

Stop after documentation-only integration if:

- a migration or business-code change would be required;
- a current Flutter failure cannot be reproduced;
- the mobile folder rename has a collision.

### 15. Required final report

Return:

1. verdict: PASS, PASS WITH RESERVATIONS or FAIL;
2. repository root, branch, HEAD and initial state;
3. pre-existing changes preserved;
4. files created/modified/renamed;
5. ADR and contradiction status;
6. OpenAPI and target-model coverage;
7. Flutter failures reproduced and repairs made;
8. validation commands and exact results;
9. forbidden files modified: must be None;
10. remaining risks and external gates;
11. explicit Go/No-Go for Sprint 0C.

Do not begin Sprint 0C in the same run.
