# ADR-002 - Administrator TOTP

Status: Accepted  
Date: 2026-07-25

## Context

E-mail OTP is too weak as the primary second factor for financial administration.

## Decision

Require RFC 6238 TOTP for every admin login. Encrypt the TOTP secret at rest. Generate ten one-use recovery codes stored as Argon2id hashes. E-mail is limited to alerts and controlled account recovery.

## Consequences

Every admin role must enroll TOTP before protected access. Recovery and reset operations are audited.
