# ADR-005 - Admin session and recovery data

Status: Accepted  
Date: 2026-07-25

## Decision

Persist admin sessions with token family, hashed refresh token, expiry, revocation and `lastTwoFactorAt`. Persist encrypted TOTP metadata and hashed one-use recovery codes.

## Consequences

Revocation, recent-auth checks, replay response and recovery are testable.
