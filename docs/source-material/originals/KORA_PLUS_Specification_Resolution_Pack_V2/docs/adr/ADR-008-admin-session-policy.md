# ADR-008 - Admin session policy

Status: Accepted  
Date: 2026-07-25

## Decision

Admin access token lifetime is 15 minutes. Refresh uses an httpOnly, Secure, appropriately SameSite cookie and an eight-hour inactivity window backed by AdminSession. Tokens never use localStorage. Sensitive actions require TOTP re-verification within five minutes.

## Consequences

The back-office supports immediate revocation without sacrificing a normal workday experience.
