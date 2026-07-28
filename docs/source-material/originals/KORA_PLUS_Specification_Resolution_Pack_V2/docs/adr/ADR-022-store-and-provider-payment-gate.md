# ADR-022 - Store and provider payment gate

Status: Accepted contract gate  
Date: 2026-07-25

## Decision

Implement only provider-neutral sandbox contracts until these are approved:

- Apple/Google distribution and digital-goods payment strategy for target storefronts;
- Orange Money, Moov Money, Wave, card and SMS provider contracts;
- taxes, receipts, refunds, chargebacks and data-residency obligations.

No production checkout architecture may depend on an assumed store exception.

## Consequences

Sprint 0 and sandbox Slice 1 can proceed. Real payment and production distribution remain blocked by explicit external approval, not by a hidden technical assumption.
