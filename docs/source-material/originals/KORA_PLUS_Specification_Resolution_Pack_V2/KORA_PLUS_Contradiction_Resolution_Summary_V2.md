# KORA+ - Contradiction Resolution Decision Memo

## 1. Executive decision

**GO for Sprint 0B - Architecture Alignment and Foundation Repair.**

The contradictions identified in the Executive Readiness Report are now converted into accepted decisions. Mohamed no longer needs to arbitrate the technical points. The next Codex run can integrate the governance pack, align the target contracts and repair the current Flutter foundation.

The audio purchase vertical slice is not yet authorized. It starts only after Sprint 0B and Sprint 0C pass their exit gates.

## 2. Decisions that remove the main contradictions

| Area | Final decision | Product effect |
|---|---|---|
| MVP scope | Ticketing moves completely to V2 | Launch effort stays focused on digital cultural content |
| Entry flow | Splash always opens Home | Catalog remains accessible without an account |
| Identity | Verified phone is mandatory; e-mail optional; no social login at MVP | One clear account identity for Mali and West Africa |
| Artist role | Administration alone creates and publishes content | No unplanned artist publishing portal |
| Payment | One Order can have several immutable PaymentAttempts | Retries and provider changes remain traceable |
| Finance | Balanced append-only ledger and compensating entries | Refunds and corrections are auditable |
| Artist share | `artistRevenueShareBps=2000`, meaning 20% | No ambiguity between platform commission and artist share |
| Artist support | Net amount after unavoidable tax/provider fees goes to the artist | "Soutenir l'artiste" keeps a credible direct-support meaning |
| Media | Private MediaAsset plus short-lived signed playback descriptors | No raw media source URL is exposed |
| Preview | Anonymous mobile PreviewGrant, separate from Entitlement | Guests can listen to a short extract without an account |
| Archive | Removed publicly, preserved in Mes achats for buyers | Permanent purchase remains permanent |
| Offline | AES-256-GCM chunks, device-bound key and renewable license | No clear media file is stored at rest |
| Back-office | Light theme only; least-privilege server RBAC | Less UI debt and fewer dangerous permissions |
| Social scope | Favorites/playlists before beta; reviews/ratings in V2 | Player utility remains, moderation debt is deferred |

## 3. Refund and loyalty rule

A full refund of an item revokes only the corresponding purchase right when no other valid grant exists. It creates compensating ledger entries, reverses the net sale and artist earning, and lowers the net qualifying spend.

The loyalty tier already achieved never moves down during the MVP. A refunded amount does not help the user reach the next tier.

## 4. What Codex is authorized to do now

1. Preserve and audit the current KORA-REBUILD repository.
2. Integrate SOURCE_OF_TRUTH, the Alignment Register V2, Decision Log and ADR-001 through ADR-024.
3. Produce the target data-model document and pilot OpenAPI without migrations.
4. Restructure requirements traceability.
5. Reproduce and repair the current Flutter foundation errors.
6. Validate the foundation and give a Go/No-Go for Sprint 0C.

<!-- pagebreak -->

## 5. Known foundation issues to verify

- Theme API mismatch: `CardTheme` versus `CardThemeData`.
- Obsolete `MyApp` reference in the generated widget test.
- RenderFlex overflow in the foundation screen.
- Windows desktop build unavailable because Visual Studio desktop tooling is absent; this is not an MVP blocker.

Codex must reproduce each current failure before modifying it and must preserve all pre-existing user work.

## 6. What remains prohibited

- Real payment integration.
- Prisma migrations for transaction, finance, media or offline domains.
- Ledger, refund, payout or reconciliation business code.
- Media upload/publication business workflow.
- Secure offline implementation.
- Ticketing and reviews.
- Production credentials or provider URLs.

<!-- spacer -->

## 7. External gates that remain

Real payment and production distribution still require store-policy, provider-contract, tax, receipt, refund and data-residency approval. This is an external commercial/legal gate, not a remaining specification contradiction.

## 8. Immediate action

Give Codex:

- the current KORA-REBUILD repository;
- this Resolution Pack V2;
- the reference documents, especially Cahier des charges V4;
- `SPRINT_0B_ARCHITECTURE_ALIGNMENT_AND_FOUNDATION_REPAIR.md`.

Expected result: a contradiction-free governance baseline, aligned pilot contracts, repaired Flutter foundation and a clear Go/No-Go for Sprint 0C.
