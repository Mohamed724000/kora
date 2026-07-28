# KORA+ Source of Truth

Status: Accepted  
Effective date: 2026-07-25

## Authority order

1. `KORA_PLUS_Cahier_des_charges_V4.docx` - product, business scope and functional rules.
2. Accepted ADRs in `docs/adr/` - later corrections and explicit decisions that remain consistent with the Cahier des charges.
3. `KORA_PLUS_Engineering_Specification.docx` plus Addendum V1.1 - architecture, API, data, security and tests, as corrected by accepted ADRs.
4. `KORA_PLUS_UI_UX_Design_Specification_V1.docx` - Flutter screens and flows, as corrected by accepted ADRs.
5. `KORA_PLUS_Back_Office_UI_UX_AdminLTE_Integration_Specification_V1.1.docx` - Next.js administration, as corrected by accepted ADRs.
6. `docs/governance/SPEC_ALIGNMENT_REGISTER.md` - index of conflicts and their resolution.
7. Benchmark Empire Afrique - ergonomic evidence only, never a source of brand assets or proprietary design.

## Conflict rule

No contributor or AI may choose silently between conflicting instructions.

1. Record the conflict in the alignment register.
2. State its product, security, finance or delivery impact.
3. Apply the authority order above.
4. Create or amend an ADR for architecture or product behavior.
5. Update the traceability matrix and affected contracts.

## Change rule

- Accepted ADRs require a dated decision-log entry.
- Financial, payment, entitlement, media and security behavior must be contract-first.
- The OpenAPI contract and Prisma schema must not contradict an accepted ADR.
- Historical settled financial records are never edited; corrections use compensating entries.
- A future document revision may absorb an ADR, but the ADR remains as decision history.
