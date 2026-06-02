---
name: mock-data-generation
description: 'Generate and evolve project-specific mock data files for testing payment scripts. Use when creating fake CSV/XLSX inputs, defining schemas, and validating sample data quality.'
argument-hint: 'What mock file do you want to define or generate?'
user-invocable: true
disable-model-invocation: false
---

# Mock Data Generation

Build and maintain fake data files for this repository in a controlled, iterative way.

## When to Use
- You are defining a new mock data file format.
- You need sample CSV or XLSX data for development or demo runs.
- You want deterministic test-style data with realistic edge cases.
- You are refining fake-data rules over multiple chat turns.

## Current Scope (Skeleton)
- Domain: house committee payment tracking.
- In-scope formats: CSV and XLSX.
- Out-of-scope for now: database-backed generation, random online data sources.
- The user will provide file-specific rules gradually; this skill must evolve with those rules.

## Procedure
1. Clarify the target file.
Ask for file name, format (CSV/XLSX), and intended use (dev test, demo, validation).
2. Capture minimum schema.
List required columns, data types, and required vs optional fields.
3. Define generation rules.
Document row count, value patterns, constraints, and edge cases (missing, partial, invalid).
4. Decide determinism level.
Choose fixed static rows or seed-based generation so outputs are reproducible.
5. Generate mock data file.
Create the file in the workspace path requested by the user.
6. Validate output quality.
Check schema match, type consistency, and edge-case coverage.
7. Summarize and store evolution notes.
Record what was added, assumptions, and what remains undefined for the next iteration.

## Decision Points
- If schema is incomplete, pause and ask focused questions before generating files.
- If business rules conflict, prefer explicit user-provided rules over inferred assumptions.
- If output format is undecided, default to CSV unless the user asks for XLSX.
- If realism conflicts with simplicity, generate a minimal valid dataset first, then add realism in a second pass.

## Quality Checks (Definition of Done)
- The generated file opens correctly in expected tools.
- Columns match the agreed schema and order.
- Sample includes at least one normal case and one edge case.
- Values are coherent (for example, dates, amounts, and IDs are internally consistent).
- Assumptions and pending questions are documented at the end of the response.

## Iterative Update Protocol
- Treat each new user clarification as a version increment to this skill.
- Prefer small edits to this SKILL.md rather than rewrites.
- Keep this file concise; move large examples to references/assets later when needed.

## Placeholders To Fill In Later
- Canonical tenant/payment field dictionary.
- Exact definition of missing payment and partial payment.
- Standard output folder conventions.
- Reusable templates for monthly mock files.
