# KORA+ Decision Log

## 2026-07-25 - Specification closure

Owner: Mohamed Sogoba  
Technical authority: ChatGPT Work / KORA+ CTO function  
Status: Accepted

- Cahier des charges V4 remains the product authority and is not rewritten wholesale.
- Accepted ADRs are the correction layer for engineering, mobile and back-office documents.
- Billetterie is removed from the MVP and scheduled for V2.
- The MVP account identity is a verified phone number. E-mail is optional and social login is excluded.
- Guest users always reach Home; authentication is requested only for a protected action.
- Artist content publication remains administration-only at MVP.
- The ambiguous word "commission" is removed from financial fields. The default artist share is `2000` basis points, meaning 20%.
- A content-sale artist share is calculated on eligible settled revenue after tax and refunds; external provider fees remain a platform cost.
- "Soutenir l'artiste" transfers the net collected amount after unavoidable taxes and provider fees to the artist at MVP; KORA+ takes no additional support commission.
- Orders support multiple immutable payment attempts.
- All financial corrections use balanced compensating ledger entries.
- A full item refund revokes only the corresponding entitlement when no other valid grant exists, reverses its net sale and artist earning, and lowers net qualifying spend. The achieved loyalty tier never moves down at MVP.
- Public previews are anonymous capabilities in the mobile application only. The web never plays media.
- Media source URLs are private. Clients receive short-lived signed playback descriptors only.
- Editorial publication and media processing are separate state machines.
- Archived content disappears publicly but remains available to prior buyers.
- Payment webhooks are durably recorded before acknowledgement.
- Audit records are transactional and database-enforced append-only.
- Offline files use device-bound encryption and renewable licenses; clear media is never persisted.
- Favorites and simple playlists remain before beta. Reviews and ratings move to V2.
- Back-office is light-only at MVP.
- Support role is masked read-only and cannot block users, revoke sessions, refund, approve payouts, modify content or change configuration.
- The benchmark evidence count is 16 captures.
- Real native payment distribution remains gated by provider contracts, store rules and legal review.

## 2026-07-25 - Execution authorization

- Sprint 0B Architecture Alignment and Foundation Repair is authorized.
- Existing repository work must be preserved and audited.
- Known Flutter foundation failures may be repaired.
- Payment, ledger, offline, media publication and other business behavior remain prohibited until contracts and target schema pass validation.
