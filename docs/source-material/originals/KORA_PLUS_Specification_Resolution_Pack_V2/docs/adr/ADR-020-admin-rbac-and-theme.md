# ADR-020 - Admin RBAC and MVP theme

Status: Accepted  
Date: 2026-07-25

## Decision

RBAC is enforced by NestJS at route, action and field level.

- `super_admin`: all actions, with recent TOTP for sensitive mutations.
- `content_editor`: content and artist-profile operations, never revenue share or finance.
- `finance_manager`: orders, payments, ledger, reconciliation and payout workflow, never content publication or configuration.
- `support`: masked read-only user/order/payment status plus creation of an assisted-recovery case; no block, session revoke, refund, payout, content or configuration mutation.

The back-office ships light-only at MVP. Remove the dark-theme toggle.

## Consequences

UI hiding is convenience only. Server tests prove every forbidden action and forbidden field.
