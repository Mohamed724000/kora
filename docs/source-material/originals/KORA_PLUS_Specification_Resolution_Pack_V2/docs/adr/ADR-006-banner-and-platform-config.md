# ADR-006 - Banner and platform configuration

Status: Accepted  
Date: 2026-07-25

## Decision

Add an audited Banner model and a versioned PlatformConfig. Configuration includes active payment providers, withdrawal threshold and revenue rules. Use `defaultArtistRevenueShareBps=2000`; never use ambiguous `defaultCommissionRatePercent`.

## Consequences

Admin screens have durable data targets and all financial configuration changes retain history.
