# ADR-024 - Realistic capture protection

Status: Accepted  
Date: 2026-07-25

## Decision

Apply `FLAG_SECURE` on Android protected screens. On iOS, detect active screen capture/recording where APIs allow and pause or obscure protected playback. Use short-lived tokens, device binding, offline encryption and V2 DRM as layered controls.

Do not claim that software can block every OS version, modified device, external capture card or second camera.

## Consequences

Security promises remain accurate and testable. Root/jailbreak signals increase risk response but are not treated as perfect proof.
