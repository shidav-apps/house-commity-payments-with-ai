---
name: tenant-list-input-schema
description: "Understand and use the tennants-list.xlsx tenant registry input file. Use when parsing tenant list data, mapping Hebrew housing/payment columns, determining who should pay monthly house committee fees, validating apartment-level records, or joining tenant list data with payment history. Keywords: tennants-list.xlsx, tenant list, apartment registry, מיסי ועד בית, קרן שיפוצים, שם השוכר, שטח דירה."
argument-hint: "Optional: add the analysis goal (e.g., validate rows, map schema, or derive expected payer per apartment)."
---

# Tenant List Input Schema

Use this skill whenever work involves the tenant list file (`tennants-list.xlsx`) under the `inputs` folder.

## What This File Represents

- The file is an apartment registry, one row per apartment.
- It contains owner contact details and, when relevant, tenant contact details.
- It also contains monthly expected charges per apartment:
- `מיסי ועד בית` (house committee fee)
- `קרן שיפוצים` (renovation fund)
- `שטח דירה` (apartment area)

## Column Structure

Use the exact labels below as canonical keys.

1. `Appt`: Apartment number (primary apartment identifier in this file)
2. `Floor`: Apartment floor
3. `Name`: Owner name
4. `Mobile`: Owner mobile phone
5. `PhoneExtra`: Additional owner phone
6. `Email`: Owner email
7. `שם השוכר`: Tenant name (filled when rented)
8. `Phone1`: Tenant phone 1
9. `Phone2`: Tenant phone 2
10. `Email2`: Tenant email
11. `מיסי ועד בית`: Monthly house committee amount for the apartment
12. `קרן שיפוצים`: Monthly renovation fund amount for the apartment
13. `שטח דירה`: Apartment area

## Payment Responsibility Logic

Apply this logic when deriving expected payer by charge type:

1. `קרן שיפוצים` is always paid by the owner.
2. `מיסי ועד בית` is paid by:
- Owner, when the owner lives in the apartment.
- Tenant, when the apartment is rented.
3. The rented-apartment indicator is definitive: if `שם השוכר` is non-empty, the apartment is rented; if it is empty, the apartment is not rented.

## Data Handling Rules

1. Treat each row as a single apartment contract context (owner + optional tenant + charges).
2. Keep Hebrew labels unchanged in code, mappings, outputs, and checks.
3. Normalize charge fields before numeric math:
- Remove currency symbol `₪`
- Remove thousands separators
- Trim whitespace
4. Preserve apartment identity using `Appt` as the main join key against other inputs. In this source file, `Appt` is guaranteed to be unique.
5. If both owner and tenant fields are partially empty, flag the row for manual review instead of guessing.

## Validation Checklist

Use this before any downstream report generation:

1. `Appt` exists and is unique per row set.
2. `מיסי ועד בית` and `קרן שיפוצים` can be parsed as non-negative numbers.
3. If `שם השוכר` is present, at least one tenant contact field (`Phone1`, `Phone2`, `Email2`) should usually be present.
4. If `שם השוכר` is empty, owner contact fields should be present (`Name` plus at least one of `Mobile`/`Email`).
5. `שטח דירה` is optional for this repository; when present it should be numeric.

## Expected Outputs When Using This Skill

When asked to process or reason about `tennants-list.xlsx`, produce:

1. A clear schema mapping using the exact column labels above.
2. A derived payer decision per apartment for each charge type.
3. A list of validation warnings for ambiguous or incomplete records.
4. A join-ready apartment key strategy based on `Appt`.
