---
name: tenants-payment-history-schema
description: "Understand and use the payment-history.xlsx payment registry input file. Use when parsing payment transaction data, mapping Hebrew payment columns, validating payment records, joining payment history with tenant registry, reconciling apartment-level payments, or deriving payment summaries. Keywords: payment-history.xlsx, payment history, payment transactions, תאריך, דירה, וועד בית, קרן שיפוצים, תיאור מורחב."
argument-hint: "Optional: add the analysis goal (e.g., validate rows, reconcile payments, aggregate by period, or join with tenant list)."
---

# Payment History Input Schema

Use this skill whenever work involves the payment history file (`payment-history.xlsx`) under the `inputs` folder.

## What This File Represents

- The file is a payment transaction registry, one row per payment transaction.
- Each transaction record captures when payment was made, which apartment it was for, and how the amount was split.
- It contains tenant name information and apartment numbers.
- Payment amounts are split between two charge types:
  - `וועד בית` (house committee fee)
  - `קרן שיפוצים` (renovation fund)
  - `בזכות` (total amount paid) is the sum of these two.
  - `תיאור מורחב` (extended description) contains unstructured text that must be parsed to extract payer information and payment context.
- The file includes payment metadata (dates, references, payer info via extended description).

## Column Structure

Use the exact labels below as canonical keys. Columns are listed in their typical order in the file.

1. `תאריך` (Payment Date): Date when the payment was actually received/processed
2. `תאריך הערך` (Value Date): Can typically be ignored—usually same as payment date
3. `תיאור` (Description): Non-critical field, minimal business value
4. `אסמכתא` (Payment Reference/Receipt Number): Unique reference identifier for the transaction
5. `בזכות` (Total Amount Paid): Total payment amount received; this amount is split between house committee and renovation fund
6. `תיאור מורחב` (Extended Description): Free-text field that must be parsed to extract payer name and context; formatting is inconsistent and requires manual or heuristic parsing
7. `דירה` (Apartment Number): Apartment identifier; the key to join with tenant registry
8. `וועד בית` (House Committee Payment): Portion of total payment allocated to house committee fee
9. `קרן שיפוצים` (Renovation Fund Payment): Portion of total payment allocated to renovation fund
10. `מיוחדת` (Special Field): Can typically be ignored
11. `הערות` (Notes): Critical field containing notes about payment period; may reference a specific month/date that differs from the payment transaction date

## Payment Logic

Apply this logic when processing and validating payment records:

1. **Payment Amount Split**: `בזכות` = `וועד בית` + `קרן שיפוצים` (must balance within rounding/currency tolerance)
2. **Apartment Identity**: Join records using `דירה` as the key against the tenant registry (`tennants-list.xlsx`).
3. **Payment Period vs. Transaction Date**: The `הערות` field is critical because:
   - `תאריך` is when the payment was *received*
   - `הערות` describes what *period* the payment covers
   - These may differ significantly (e.g., payment received in January for December charges)
4. **Payer Identification**: The `תיאור מורחב` field must be parsed to extract:
   - Payer name (owner or tenant)
   - Contextual information (e.g., which party made the payment)
   - Formatting is inconsistent; document any assumptions

## Data Handling Rules

1. Treat each row as a single payment transaction event for one apartment.
2. Keep Hebrew labels unchanged in code, mappings, outputs, and checks.
3. Normalize numeric fields before mathematical operations:
   - Remove currency symbol `₪` if present
   - Remove thousands separators
   - Trim whitespace
4. Date fields: Parse as date type; handle potential Excel serial number issues.
5. Preserve apartment identity using `דירה` as the main join key against the tenant registry. In this source file, `דירה` may have duplicate values (same apartment pays multiple times).
6. When parsing `תיאור מורחב` for payer name:
   - If parsing fails, flag the row for manual review with the raw description
   - Document any heuristics used (e.g., "assumed owner if exact match not found")
7. Always validate the payment split (`בזכות` = `וועד בית` + `קרן שיפוצים`) before downstream processing.

## Validation Checklist

Use this before any downstream report generation or reconciliation:

1. `דירה` (apartment) is not empty and can be matched to `tennants-list.xlsx`.
2. `תאריך` is a valid date.
3. `בזכות` parses as a non-negative number.
4. `בזכות` = `וועד בית` + `קרן שיפוצים` (accounting balance check).
5. `וועד בית` and `קרן שיפוצים` are each non-negative.
6. `אסמכתא` (reference number) is unique or documented if duplicates appear.
7. `הערות` field is populated and contains period information; extract and document the payment period.
8. `תיאור מורחב` can be parsed for payer name; flag ambiguous entries.

## Join Strategy with Tenant List

When joining `payment-history.xlsx` with `tennants-list.xlsx`:

- **Join key**: `דירה` (Payment History) = `Appt` (Tenant List)
- **Many-to-one relationship**: Multiple payment transactions per apartment are expected in payment history; each apartment appears once in tenant list.
- **Validation**: If a payment references an apartment not in the tenant registry, flag as "unknown apartment" for investigation.
- **Expected outcomes**:
  - For each payment, attach expected payer (owner or tenant) based on rental status
  - Cross-check actual payer (from `תיאור מורחב`) against expected payer
  - Flag discrepancies for reconciliation

## Expected Outputs When Using This Skill

When asked to process or reason about `payment-history.xlsx`, produce:

1. A clear schema mapping using the exact column labels above.
2. Parsed payment records with:
   - Normalized amounts (numeric, no currency symbols)
   - Extracted payment period (from `הערות`)
   - Parsed payer name (from `תיאור מורחב`) with confidence notes
   - Apartment identifier ready for joining
3. A balance check: `בזכות` = `וועד בית` + `קרן שיפוצים` for each row.
4. A list of validation warnings for:
   - Missing or ambiguous fields
   - Unknown apartments
   - Payer name parsing failures
   - Unbalanced payments
5. A join-ready payment record keyed by apartment (`דירה`) and suitable for aggregation by period or reconciliation against tenant expectations.
