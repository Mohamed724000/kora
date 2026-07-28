# ADR-016 - Entitlements, Mes achats and archived content

Status: Accepted  
Date: 2026-07-25

## Decision

Mes achats is driven by permanent Entitlements, not Order status alone. Public catalog queries exclude archived content. A valid holder accesses archived content through an authenticated library endpoint. Deleting or archiving catalog metadata never deletes rights or private media still required by buyers.

The Player root shows the current media when one exists; otherwise it shows an intelligent empty state with recent purchases/history. The mini-player exists only while real media is loaded.

## Consequences

The permanent-purchase promise remains true after catalog lifecycle changes.
