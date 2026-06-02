# AGENTS.md

## Purpose
This repository builds scripts that identify tenants with missing or partial house committee payments and produce an organized report for the collector.

## Project Stage
- Repository stage: brand new scaffold.
- Current codebase content is minimal. Use this file as the working source of truth for agent behavior until project docs expand.

## Agent Operating Rules
- Ask before any non-trivial change.
- Keep solutions script-oriented (no frontend or backend app structure unless explicitly requested).
- Prefer concise English in generated docs, comments, and commit messages.
- Do not introduce database dependencies unless explicitly requested.
- Use local files as data sources (CSV and Excel are in scope now; JSON may be used when requested).

## Technical Baseline
- Runtime: Node.js 22 LTS.
- Language: TypeScript with `strict: true`.
- Package manager: npm.
- External libraries: allowed when reliable and justified.

## Workflow Expectations
- No pull request workflow is required at this stage.
- Tests are not required yet.
- Secrets policy: never commit secrets; if needed, use `.env.example` as template.

## Data and Reporting Scope (Current)
- Input formats in scope: CSV and `.xlsx`.
- Report logic and schema are intentionally pending and must be clarified before implementing business rules.

## Implementation Guidance for Agents
- For any task that depends on payment-domain rules not yet defined, pause and ask focused clarification questions.
- When proposing code changes, keep the first version minimal and easy to iterate.
- Prefer deterministic scripts and explicit file paths over implicit conventions.

## Open Decisions (Must Be Confirmed Before Core Logic)
- Minimum payment record schema.
- Exact definition of missing or partial payment.
- Initial report output format and required columns.
- Monthly execution approach (manual command vs scheduler automation).
- Mock data strategy for phase 1.

## References
- Project README: [README.md](README.md)