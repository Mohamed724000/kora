# ADR-017 - Anonymous preview and signed playback

Status: Accepted  
Date: 2026-07-25

## Decision

Public preview exists only in the mobile app. Catalog contracts return `previewAvailable` and duration metadata, never `previewUrl`. A preview endpoint issues a short-lived device/IP/rate-limited PreviewGrant. Purchased playback requires a valid Entitlement and registered session/device. Both exchange grants for short-lived signed playback descriptors that are never persisted or logged.

Default preview duration is 30 seconds and remains configurable per content within an admin-controlled ceiling.

## Consequences

Guests can evaluate content without receiving a durable media location. The public web has no playback endpoint or player.
