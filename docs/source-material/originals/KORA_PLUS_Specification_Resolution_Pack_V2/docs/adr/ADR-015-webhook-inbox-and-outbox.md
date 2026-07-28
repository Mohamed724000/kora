# ADR-015 - Webhook Inbox and transactional Outbox

Status: Accepted  
Date: 2026-07-25

## Decision

Verify request authenticity, persist the provider event in PostgreSQL with a unique provider/event key, and only then acknowledge. Process idempotently from the Inbox. Write business state and Outbox events in the same database transaction. BullMQ transports work but is not the system of record.

## Consequences

A queue outage or worker crash cannot silently lose an accepted financial event.
