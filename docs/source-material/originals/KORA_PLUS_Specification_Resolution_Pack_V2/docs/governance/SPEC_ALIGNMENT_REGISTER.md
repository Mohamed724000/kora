# KORA+ Specification Alignment Register

Version: 2.0  
Effective date: 2026-07-25  
Status values: Accepted, Deferred V2, Contract gate, Superseded

## Resolved register

| ID | Domain | Conflict or gap | Final decision | Authority | Status |
|---|---|---|---|---|---|
| REG-01 | Dependency | ApexCharts described as included in AdminLTE React | Install `apexcharts` explicitly beside `@adminlte/react` | ADR-001 | Accepted |
| REG-02 | Admin auth | E-mail code used as second factor | TOTP plus one-use recovery codes; e-mail is alert/recovery only | ADR-002 | Accepted |
| REG-03 | Admin dashboard | One summary endpoint conflicts with independent widgets | Six independent dashboard endpoints with local loading/error states | ADR-003 | Accepted |
| REG-04 | Audit API | Audit screen exists without a formal read API | Read-only cursor-paginated audit endpoint, super_admin only | ADR-004 | Accepted |
| REG-05 | Admin API | Back-office uses undocumented routes | OpenAPI becomes the living contract before implementation | ADR-009 | Accepted |
| REG-06 | Admin session | No persisted 2FA freshness or revocation | Persist AdminSession and recent TOTP verification | ADR-005, ADR-008 | Accepted |
| REG-07 | Admin TOTP | No TOTP secret or recovery-code model | Encrypted TOTP secret and hashed one-use recovery codes | ADR-002, ADR-005 | Accepted |
| REG-08 | Editorial | Banner screens have no data destination | Add Banner model and explicit public contract | ADR-006 | Accepted |
| REG-09 | Configuration | Platform settings have no model | Add versioned/singleton PlatformConfig with audited changes | ADR-006 | Accepted |
| REG-10 | Terminology | "Achat VIP" and "Soutenir l'artiste" mixed | User-facing label is only "Soutenir l'artiste"; technical entity is `ArtistSupport` | ADR-007, ADR-014 | Accepted |
| REG-11 | Performance | Back-office has no mobile-like RAM budget | Use web performance budgets and progressive widget loading; no Android RAM rule | ADR-003, ADR-009 | Accepted |
| REG-12 | Tests | Financial coverage threshold appears only in back-office spec | Minimum 90% branch coverage for financial domain logic plus integration invariants | Definition of Done | Accepted |
| REG-13 | Admin session | JWT/cookie mechanism and duration unclear | Access 15 min, refresh 8 h inactivity window, httpOnly secure cookies, server revocation | ADR-008 | Accepted |
| REG-14 | Artist scope | CdC mission suggests artist publication while detailed rules prohibit it | Administration alone creates, edits and publishes content at MVP | ADR-011 | Accepted |
| REG-15 | Guest-first | Splash redirects a visitor to login | Splash always resolves to Home; protected actions preserve `returnTo` through auth | ADR-010 | Accepted |
| REG-16 | Identity | E-mail/social alternatives conflict with mandatory phone | Verified phone is mandatory; e-mail optional; social login removed from MVP | ADR-010 | Accepted |
| REG-17 | Ticketing | Ticketing appears in MVP criteria and V2 | Complete ticketing is V2; no ticket model, seed or MVP acceptance criterion | ADR-023 | Deferred V2 |
| REG-18 | Payment | Order has one Payment while retry/provider change is required | `Order` has one-to-many immutable `PaymentAttempt` records | ADR-012 | Accepted |
| REG-19 | Finance | Compensation required without refund/ledger structures | Balanced append-only ledger and compensating entries are mandatory | ADR-013 | Accepted |
| REG-20 | Artist revenue | Balance exists without sale accrual or frozen rate | Create immutable `ArtistEarning`; freeze `artistRevenueShareBps` and basis per paid line | ADR-014 | Accepted |
| REG-21 | Preview | Anonymous preview depends on a user Entitlement | Separate anonymous PreviewGrant from purchased Entitlement | ADR-017 | Accepted |
| REG-22 | Media URL | API returns `previewUrl` despite source-URL prohibition | Return capability metadata; exchange it for a short-lived signed playback descriptor | ADR-011, ADR-017 | Accepted |
| REG-23 | Publication | Editorial status and Mux processing status are conflated | Separate `Content.status` from `MediaAsset.processingStatus` | ADR-011 | Accepted |
| REG-24 | Archive | Archived content can return 404 to a buyer | Hide from public catalog, preserve access through Mes achats for valid Entitlement | ADR-016 | Accepted |
| REG-25 | Webhook | Queue acknowledgement precedes durable persistence | Persist Webhook Inbox first, then process through transactional Outbox | ADR-015 | Accepted |
| REG-26 | Sessions | Refresh, step-up artist auth and admin reverify incomplete | Rotation, replay detection, revocation and recent-auth endpoints are contractually defined | ADR-010 | Accepted |
| REG-27 | Audit | "Immutable" audit has no database enforcement | Write audit in the business transaction and block UPDATE/DELETE at DB level | ADR-019 | Accepted |
| REG-28 | Offline | Encryption location, key lifecycle and revocation are vague | AES-256-GCM chunks, device-bound wrapped key, renewable license, no clear file at rest | ADR-018 | Accepted |
| REG-29 | Library UI | Favorites/playlists are shown without models or APIs | Keep favorites and simple playlists; implement in Slice 3 before beta | ADR-021 | Accepted |
| REG-30 | Reviews | Reviews are displayed but no trusted source/moderation exists | Remove reviews and ratings from MVP screens/contracts; return in V2 | ADR-021 | Deferred V2 |
| REG-31 | Notifications | UI/admin screens exist without delivery models | Add Notification, Template, Delivery, PushToken and Preference before Slice 6 | ADR-021 | Accepted |
| REG-32 | Checkout UI | Four providers "always visible" conflicts with admin disable | Show only configured and operational providers; block checkout if none are available | ADR-012 | Accepted |
| REG-33 | Admin theme | Dark toggle exists without a dark admin design system | Back-office is light-only at MVP; remove the toggle | ADR-020 | Accepted |
| REG-34 | RBAC | Support/content_editor permissions exceed least privilege | Field-level server RBAC; support is masked read-only and cannot mutate finance/security | ADR-020 | Accepted |
| REG-35 | Mobile flows | Player root and auth/support sheets are referenced but underspecified | Define root Player, contextual auth gate and Artist Support flow before UI code | ADR-010, ADR-014, ADR-016 | Accepted |
| REG-36 | Benchmark | Register says 15 captures while the document contains 16 | Canonical count is 16; benchmark remains behavioral only | Decision log | Accepted |
| REG-37 | Revenue language | `commissionRatePercent=20` can mean platform or artist share | Replace with `artistRevenueShareBps=2000`; admin label is "Part artiste" | ADR-014 | Accepted |
| REG-38 | Refund effects | Refund impact on rights, sales, loyalty and artist revenue is undefined | Full item refund revokes its right and compensates sales/earnings; loyalty tier never downgrades | ADR-013, ADR-016 | Accepted |
| REG-39 | Capture protection | Documents overstate platform ability to block every recording | Apply platform controls, detect when possible, never promise impossible protection | ADR-024 | Accepted |
| REG-40 | Store payment | Native digital-goods checkout may conflict with distribution rules | Sandbox only until store/provider/legal strategy is approved | ADR-022 | Contract gate |

## No silent blockers

All technical contradictions required for Sprint 0 and the audio pilot have a final decision. REG-40 is not a documentation ambiguity: it is an external contractual gate before real payments and production distribution.

## Required propagation

Codex must update:

- the pilot OpenAPI;
- the target Prisma design;
- the requirements traceability matrix;
- mobile UI flow notes;
- back-office RBAC matrix;
- threat model and Definition of Done.

Codex must not edit the original DOCX files inside the repository merely to duplicate these decisions. The accepted ADRs and living repository contracts are the operational correction layer.
