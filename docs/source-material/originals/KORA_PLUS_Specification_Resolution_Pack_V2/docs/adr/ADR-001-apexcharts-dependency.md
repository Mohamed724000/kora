# ADR-001 - ApexCharts dependency

Status: Accepted  
Date: 2026-07-25

## Context

AdminLTE React provides chart integration but does not remove the need for the runtime package.

## Decision

Install and lock `@adminlte/react`, `bootstrap`, `bootstrap-icons` and `apexcharts` explicitly. Do not introduce another chart library.

## Consequences

Builds are reproducible and chart ownership is unambiguous.
