# ADR-003 - Independent dashboard endpoints

Status: Accepted  
Date: 2026-07-25

## Decision

Use separate endpoints for `kpis`, `sales-trend`, `security-alerts`, `top-content`, `top-artists` and `pending-payouts`. Each widget owns its loading, error, cache and role policy.

## Consequences

A slow or failed widget never blocks the rest of the dashboard. Financial failure is never displayed as zero.
