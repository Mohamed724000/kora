# ADR-019 - Transactional append-only audit

Status: Accepted  
Date: 2026-07-25

## Decision

Critical admin mutations and their AuditLog are written in the same database transaction. Audit records include actor, session, action, entity, masked before/after, reason, request correlation and timestamp. Application roles have INSERT/SELECT only; database policy or trigger rejects UPDATE/DELETE.

## Consequences

A successful mutation cannot exist without its audit record. Audit exports mask PII and are themselves audited.
