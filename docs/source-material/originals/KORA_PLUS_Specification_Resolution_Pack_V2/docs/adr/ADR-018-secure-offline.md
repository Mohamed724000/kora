# ADR-018 - Secure offline package and license

Status: Accepted  
Date: 2026-07-25

## Decision

Offline is available only for a valid Entitlement on a registered device. Media is processed in chunks and persisted only as AES-256-GCM ciphertext. Each package uses a unique content key wrapped to a non-exportable device key in Android Keystore/iOS Keychain. Associated data binds user, device, content, license and chunk index.

The server issues a renewable offline license with status, expiry, key version and anti-replay counter. Logout, device revocation or license revocation removes the wrapped key and encrypted package. Download supports atomic chunks, checksum, pause/resume, Wi-Fi-only and low-storage handling.

## Consequences

Purchase rights remain permanent, but offline possession requires periodic license renewal. Implementation requires a security review and real-device tests before beta.
