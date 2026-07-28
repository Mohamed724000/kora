# KORA+ Final — Codex execution prompt

## Sprint 0 — Clean-room Foundation Bootstrap

You are the Principal Engineering Execution Lead for KORA+. KORA+ is a
production-oriented product, not a demo.

This prompt supersedes every earlier Sprint 0A/0B prompt.

## 1. Context

Target technical repository: `KORA-PLUS-FINAL`.

This is a clean-room implementation. Do not copy, move, inspect for reuse,
adapt, cherry-pick or repair code from:

- `STREAM/Kora`;
- `KORA-REBUILD`;
- any other previous KORA+ implementation.

Existing official specifications, accepted ADR-001 through ADR-024, brand
assets and benchmark evidence may be imported as documentation or references.
Old source code, configuration, dependency lists, migrations, generated files,
build artifacts and environment files may not be imported.

There are no legacy Flutter failures to repair. Any task mentioning
`CardThemeData`, obsolete `MyApp` tests, previous `RenderFlex` overflow or an
`apps/mobile-flutter` rename is obsolete.

## 2. Exact objective

Create a reproducible green foundation containing:

- npm-workspace monorepo root;
- `apps/mobile` using Flutter, Riverpod and GoRouter;
- `apps/web` using Next.js App Router and TypeScript;
- `apps/admin` using Next.js App Router, TypeScript, `@adminlte/react`,
  Bootstrap 5.3, Bootstrap Icons, TanStack Table and ApexCharts;
- `apps/api` using NestJS, Prisma and PostgreSQL;
- `packages/contracts`, `packages/config` and `packages/ui`;
- PostgreSQL and Redis local Docker services;
- BullMQ-ready API infrastructure without business jobs;
- environment validation and safe examples;
- structured redacted logging and Sentry-ready adapters;
- strict lint, typecheck, test and build commands;
- GitHub Actions foundation CI;
- KORA+ design-token foundations;
- minimal health checks and smoke tests;
- rights-safe deterministic seed placeholder;
- official governance and ADR files.

Do not implement business features.

## 3. Source hierarchy

1. Cahier des charges V4 — product, business and MVP scope.
2. Accepted ADR-001 through ADR-024.
3. Engineering Specification + Addendum V1.1, corrected by accepted ADRs.
4. Flutter UI/UX Specification V1, corrected by accepted ADRs.
5. Back-Office Specification V1.1, corrected by accepted ADRs.
6. Specification Alignment Register.
7. Empire Afrique benchmark — behavioral and ergonomic evidence only.

Never copy Empire Afrique branding, palette, assets, fonts, illustrations or
distinctive visual composition.

## 4. Required preflight

Before writing:

1. resolve the intended root and confirm its basename is
   `KORA-PLUS-FINAL`;
2. confirm no old application code is present;
3. record Git state, branch and HEAD when Git already exists;
4. inventory every file with `rg --files`;
5. identify user-created or uncommitted files;
6. locate and read all supplied sources fully;
7. verify installed Node, npm, Flutter, Dart, Docker and Git versions;
8. report unavailable required tooling;
9. stop if clean-room integrity cannot be guaranteed.

If the directory is not yet a Git repository, initialize Git only inside the
exact validated `KORA-PLUS-FINAL` root. Do not create a remote, commit, push or
open a pull request unless Mohamed explicitly requests it in the active
session.

## 5. Execution governance

One orchestrator owns root files and integration.

Use specialists only when sub-agents are available and file ownership can
remain disjoint.

### Wave 0 — read-only

- Requirements/ADR auditor.
- Architecture/security auditor.
- Toolchain/preflight auditor.

They produce findings only. They do not edit.

### Wave 1 — orchestrator sequential bootstrap

The orchestrator creates and validates:

- root workspace/configuration;
- directory skeleton;
- ownership map;
- shared command contract;
- environment rules.

No specialist starts before Wave 1 root contracts are stable.

### Wave 2 — parallel, disjoint ownership

Use at most three specialists by default:

- Flutter Lead: `apps/mobile/**` only.
- API/Data Foundation Lead: `apps/api/**` and
  `packages/contracts/**` only.
- Web/Admin Foundation Lead: `apps/web/**`, `apps/admin/**` and
  `packages/ui/**` only.

Root `package.json`, lockfile, `AGENTS.md`, Docker, CI and cross-project config
remain orchestrator-owned. Specialists must request integration changes instead
of editing root-owned files.

### Wave 3 — orchestrator integration

The orchestrator integrates requested root changes, Docker, CI,
observability, docs and scripts.

### Wave 4 — read-only validation

- QA & Release Lead.
- Security & Privacy Lead.
- Design QA for foundation screens.

No validator silently fixes a failure. Findings return to the owning writer.

## 6. Authorized scope

The following may be created or modified:

- root foundation files such as `package.json`, lockfile, `.nvmrc`,
  `.editorconfig`, `.gitignore`, `.env.example`, `README.md`, `AGENTS.md`;
- `apps/mobile/**`;
- `apps/web/**`;
- `apps/admin/**`;
- `apps/api/**`;
- `packages/contracts/**`;
- `packages/config/**`;
- `packages/ui/**`;
- `docs/governance/**`;
- `docs/roadmap/**`;
- `docs/qa/**`;
- `docs/security/**`;
- `docs/engineering/**`;
- `docs/adr/**`;
- `docs/api/openapi.yaml`;
- `infra/docker/**`;
- `infra/github-actions/**`;
- `infra/scripts/**`;
- `.github/workflows/**`;
- rights-safe `assets/seed/**`;
- official brand/reference placeholders that contain no copied proprietary
  benchmark asset.

## 7. Forbidden scope

Do not implement:

- user registration, login or OTP flow;
- catalog, search, category or content business APIs;
- Order, PaymentAttempt, webhook or payment provider logic;
- ledger, refund, ArtistEarning or payout logic;
- Entitlement or Mes achats;
- media upload, Mux/R2 playback or signed URLs;
- offline download or cryptography;
- admin content workflows or operational dashboards;
- loyalty, notifications or ticketing;
- production infrastructure or production credentials.

Also forbidden:

- old-code reuse;
- real secrets, tokens, phone numbers or production URLs;
- raw media URLs;
- business logic hidden inside UI scaffolds;
- AdminLTE archive HTML copied into Next.js;
- Firebase/Supabase or stack substitution;
- destructive Git commands;
- broad dependency additions outside the locked stack and foundation needs;
- claiming unavailable tests as passed.

## 8. Required repository structure

```text
apps/
  mobile/
  web/
  admin/
  api/
packages/
  contracts/
  config/
  ui/
docs/
  product/
  engineering/
  design/
  benchmark/
  governance/
  roadmap/
  qa/
  security/
  api/
  adr/
infra/
  docker/
  github-actions/
  scripts/
assets/
  brand/
  images/
  icons/
  seed/
```

Do not create empty directories solely to satisfy the tree. Use `.gitkeep` only
when the repository policy explicitly justifies it.

## 9. Foundation requirements

### Root

- npm workspaces for TypeScript applications/packages;
- one documented command contract for install, lint, typecheck, test and build;
- pinned runtime policy with documented supported versions;
- deterministic lockfile;
- strict environment-variable validation;
- no secret committed;
- clear local setup and troubleshooting.

### Mobile

- Flutter app with Riverpod and GoRouter;
- exact five-tab shell: Accueil, Découvrir, Mes achats, Lecteur, Compte;
- design tokens for deep black, anthracite, off-white and restrained gold;
- accessible type scale and touch targets;
- responsive foundation screen;
- loading/error/empty/offline primitives;
- mini-player absent when no real media exists;
- no fake purchase, auth or player business behavior;
- deterministic widget and golden-test harness;
- Android-first configuration and iOS-compilable project.

### Web public

- Next.js App Router and strict TypeScript;
- SEO-ready shell and metadata foundation;
- accessibility baseline;
- no playback, purchase or download;
- deterministic smoke test.

### Admin

- Next.js App Router and strict TypeScript;
- light operational theme;
- required AdminLTE React, Bootstrap, icons, TanStack Table and ApexCharts
  dependencies;
- layout and route placeholders only;
- no authentication or operational workflow implementation;
- no copied AdminLTE HTML archive.

### API/Data

- NestJS modular bootstrap;
- `/health/live` and `/health/ready`;
- Prisma configured for PostgreSQL;
- Redis connectivity abstraction;
- BullMQ-ready module without a business queue;
- versioned `/api/v1` routing policy;
- validation, error envelope and correlation-ID foundation;
- structured logs with redaction;
- no business schema migration;
- an empty or foundation-only Prisma schema is acceptable when documented.

### Local infrastructure

- PostgreSQL and Redis via Docker;
- health checks;
- named local development volumes;
- no production topology;
- documented reset that targets only named project resources.

### Observability

- Sentry-ready initialization controlled by environment;
- disabled safely when DSN is absent;
- structured logs;
- redaction tests for token, OTP, phone, e-mail and authorization headers.

### Governance

Install and maintain:

- `AGENTS.md`;
- `SOURCE_OF_TRUTH.md`;
- `SPEC_ALIGNMENT_REGISTER.md`;
- `DECISION_LOG.md`;
- `MVP_EXECUTION_PLAN.md`;
- `REQUIREMENTS_TRACEABILITY_MATRIX.md`;
- `DEFINITION_OF_DONE.md`;
- `THREAT_MODEL.md`;
- ADR-001 through ADR-024;
- syntactically valid pilot `openapi.yaml`.

Accepted ADRs remain accepted. Do not rewrite their decisions.

## 10. Mandatory tests and validation

Run every applicable command. Prefer repository scripts that wrap these
commands consistently.

At minimum:

### Repository

- `git status --short --branch`
- `git diff --check`
- clean-room forbidden-path/reference scan
- secret scan
- Markdown relative-link check
- ADR ID uniqueness and status check
- YAML/OpenAPI parse

### TypeScript workspace

- `npm ci` after lockfile creation
- root format check
- root lint
- root typecheck
- root tests
- root builds

Each workspace must also be reportable independently.

### Flutter

- `flutter pub get`
- `dart format --output=none --set-exit-if-changed .`
- `flutter analyze`
- `flutter test`
- Android debug build when Android tooling is available
- iOS static/config validation when macOS/Xcode is unavailable; never claim an
  iOS build passed without running it

### Docker

- Docker configuration validation;
- PostgreSQL and Redis health verification when Docker is available;
- API readiness behavior with dependencies healthy and unhealthy.

Do not install unrelated system software to make a check pass. Report unavailable
checks exactly.

## 11. Acceptance criteria

Sprint 0 passes only when:

- the repository is demonstrably clean-room;
- all official governance artifacts are present;
- four application foundations exist;
- the exact mobile five-tab shell is tested;
- no business feature has been implemented;
- no old-code reference or copied component exists;
- no secret or sensitive value is committed;
- local PostgreSQL and Redis configuration is reproducible;
- lint/typecheck/tests/builds pass where the required toolchain is available;
- CI runs the same validation contract;
- OpenAPI parses and ADR IDs are consistent;
- logs redact sensitive fields;
- setup is understandable by a developer unfamiliar with the project;
- all deviations and unavailable validations are explicitly reported.

## 12. Stop conditions

Stop before writes if:

- the root name is not `KORA-PLUS-FINAL`;
- old application code is already inside the target;
- source documents or the accepted Resolution Pack are unavailable;
- uncommitted user work overlaps authorized files and cannot be preserved;
- safe file ownership cannot be established;
- the task would require a destructive action.

Stop during execution if:

- a locked-stack substitution is required;
- business behavior is necessary to satisfy a foundation test;
- a dependency requests unsafe credentials or production access;
- an unresolved contradiction changes product, finance, security or
  architecture;
- two agents need to edit the same file concurrently.

## 13. Required final report

Return in French:

1. verdict: PASS, PASS AVEC RÉSERVES or FAIL;
2. repository root, branch, HEAD and initial state;
3. clean-room verification evidence;
4. agents used, ownership and work waves;
5. files created/modified;
6. dependencies added and why;
7. commands executed and exact results;
8. builds produced;
9. unavailable checks and reasons;
10. security and secret-scan findings;
11. ADR/OpenAPI/governance status;
12. acceptance criteria table;
13. remaining risks and technical debt;
14. explicit recommendation: GO or NO-GO for Slice 1;
15. proposed next Codex lot, without implementing it.

Do not commit, push or open a pull request unless Mohamed explicitly requests
it in the active Codex session.
