# ADR-009 - Monorepo, contracts and code generation

Status: Accepted  
Date: 2026-07-25

## Context

Four applications must evolve together without sharing implementation code accidentally.

## Decision

Use `apps/mobile`, `apps/web`, `apps/admin`, `apps/api` and narrowly scoped `packages/contracts`, `packages/config`, `packages/ui`. OpenAPI is the API source for generated Dart and TypeScript clients. Lock runtime and dependency versions in repository files.

## Consequences

Contract drift becomes a CI failure. Mobile Flutter code is not forced into npm workspaces; repository orchestration uses documented cross-runtime commands.
