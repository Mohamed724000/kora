# ADR-013 - Financial ledger, refunds and reconciliation

Status: Accepted  
Date: 2026-07-25

## Decision

Use a balanced append-only ledger. Each financial event creates a transaction group with equal debits and credits. Settled rows are never edited. Refunds, chargebacks, fees and corrections create compensating postings linked to the original event.

A full OrderItem refund:

- revokes its purchase Entitlement when no other valid grant exists;
- compensates its net sale and artist earning;
- decreases net qualifying spend;
- never downgrades an already achieved loyalty tier at MVP.

Partial refunds compensate proportionally; entitlement is revoked only when the item is fully refunded.

## Consequences

Balances are derived and reconcilable. Public sales represent net non-fully-refunded purchases.
