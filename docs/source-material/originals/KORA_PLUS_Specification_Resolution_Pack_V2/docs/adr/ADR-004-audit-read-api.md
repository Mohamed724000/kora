# ADR-004 - Audit read API

Status: Accepted  
Date: 2026-07-25

## Decision

Expose `GET /api/v1/admin/audit-logs` to `super_admin` only, with cursor pagination and filters for administrator, action, entity and date. Audit has no update/delete route. Export is asynchronous and signed.

## Consequences

Audit evidence is operationally accessible without direct database access.
