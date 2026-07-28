# KORA+ - Specification Resolution Pack

Version: 2.0  
Date: 2026-07-25  
Owner: Mohamed Sogoba, Founder and Product Owner  
Status: Approved for Sprint 0 integration

## Purpose

This pack converts the contradictions identified in the Executive Readiness Report into explicit, executable decisions. It does not replace the KORA+ Cahier des charges V4. It aligns the engineering, mobile, back-office and repository documentation with that product authority.

## Binding order

1. KORA_PLUS_Cahier_des_charges_V4.docx
2. Accepted ADRs in this pack and in KORA-REBUILD
3. KORA_PLUS_Engineering_Specification.docx plus Addendum V1.1, as corrected by the ADRs
4. KORA_PLUS_UI_UX_Design_Specification_V1.docx, as corrected by the ADRs
5. KORA_PLUS_Back_Office_UI_UX_AdminLTE_Integration_Specification_V1.1.docx, as corrected by the ADRs
6. Benchmark Empire Afrique, behavior only

An accepted ADR does not override the product intent of the Cahier des charges. It resolves an ambiguity or corrects a lower-level specification.

## Contents

- `docs/governance/SOURCE_OF_TRUTH.md`
- `docs/governance/SPEC_ALIGNMENT_REGISTER.md`
- `docs/governance/DECISION_LOG.md`
- `docs/roadmap/MVP_EXECUTION_PLAN.md`
- `docs/adr/ADR-001` through `ADR-024`
- `docs/prompts/SPRINT_0B_ARCHITECTURE_ALIGNMENT_AND_FOUNDATION_REPAIR.md`

## Immediate execution

Run the Sprint 0B prompt from the root of the current `KORA-REBUILD` repository. It first preserves and audits existing work, integrates these decisions, repairs the known foundation failures, and stops before business functionality.

## Go condition

The next vertical slice is not authorized until:

- every accepted ADR exists in the repository;
- the alignment register contains no unresolved blocker for the pilot slice;
- Flutter analyze/test/build foundation checks pass;
- Next.js web/admin and NestJS API foundation checks pass when present;
- the target Prisma schema and pilot OpenAPI are internally consistent;
- no payment, media, offline or finance behavior is implemented from an obsolete model.
