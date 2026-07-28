# ADR-014 - Artist earnings, revenue share and payouts

Status: Accepted  
Date: 2026-07-25

## Decision

Replace every ambiguous commission field with `artistRevenueShareBps`. Default is `2000`, meaning a 20% artist share.

For content sales, the frozen basis is settled item price minus legally required taxes and refunds. External payment fees are a platform cost. Every paid item creates an immutable ArtistEarning with applied basis and rate.

For "Soutenir l'artiste", the artist receives the net collected amount after unavoidable taxes and provider fees at MVP; KORA+ adds no support commission.

Payout requests reserve available earnings atomically. Status history is append-only. Approval/payment never rewrites earnings.

## Consequences

Historical earnings do not change when a later rate changes. Content editors cannot set or edit a revenue rate; only super_admin with recent TOTP may do so.
