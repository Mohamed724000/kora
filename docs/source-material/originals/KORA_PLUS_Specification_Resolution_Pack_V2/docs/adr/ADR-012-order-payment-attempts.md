# ADR-012 - Order and payment attempts

Status: Accepted  
Date: 2026-07-25

## Decision

An Order contains immutable priced items and has one-to-many PaymentAttempt records. Each initiation requires an idempotency key scoped to user and operation. Provider reference uniqueness is enforced. Terminal attempts are immutable. A retry creates a new attempt and may use a different active provider.

Checkout displays only providers that are both configured and operational.

## Consequences

Retry history, provider switching and uncertain outcomes are preserved without overwriting evidence or double-charging.
