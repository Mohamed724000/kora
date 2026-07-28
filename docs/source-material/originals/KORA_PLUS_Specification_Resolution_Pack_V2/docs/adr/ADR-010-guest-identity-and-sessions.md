# ADR-010 - Guest-first identity and sessions

Status: Accepted  
Date: 2026-07-25

## Decision

- Splash always opens Home after local bootstrap.
- Verified phone is the required customer identifier at MVP.
- E-mail is optional; social login is excluded from MVP.
- A protected action opens a contextual auth gate, then a full-screen phone/password/OTP flow with `returnTo`.
- Mobile access token is 15 minutes; refresh token is 30 days, hashed server-side and rotated once per use.
- Reuse of a rotated token revokes the session family.
- Artist payout and account-security actions require recent OTP step-up.

## Consequences

The public catalog remains frictionless while sensitive actions have explicit, testable assurance.
