# ADR-011 - Content, media and publication

Status: Accepted  
Date: 2026-07-25

## Decision

Separate editorial `Content` from private `MediaAsset` and upload/transcoding state. Administration alone creates and publishes at MVP. A content can publish only when every required asset is ready. Mux callbacks update media processing but never publish content.

`MediaAsset` stores private provider/storage identifiers, kind, checksum, duration, processing status and failure reason. APIs never return source R2 keys or raw Mux asset URLs.

## Consequences

Retries and failed transcoding do not corrupt editorial state. Artist accounts remain read-only on catalog content.
