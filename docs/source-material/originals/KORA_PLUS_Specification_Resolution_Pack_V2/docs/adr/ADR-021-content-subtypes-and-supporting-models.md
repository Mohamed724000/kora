# ADR-021 - Content subtypes and supporting models

Status: Accepted  
Date: 2026-07-25

## Decision

- Albums use ordered `AlbumTrack` rows, not an array of IDs.
- Video, podcast, book and live-replay data use explicit subtype tables or validated subtype payloads.
- Favorites and simple playlists remain MVP Slice 3 with real models/APIs.
- Reviews and ratings are removed from MVP UI, seed and contracts and return in V2 with moderation.
- Notifications require Template, Notification, Delivery, PushToken and Preference models before their slice.
- Playback statistics require PlaybackSession/Event with privacy and deduplication rules.
- Ticketing entities are excluded until ADR-023 V2 work begins.

## Consequences

UI elements cannot ship against imaginary data sources, and future content types do not overload the Content table.
