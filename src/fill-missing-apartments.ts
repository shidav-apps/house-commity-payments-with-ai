import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import XLSX from "xlsx";
import type {
  ApartmentDetails,
  ApartmentNumber,
  TennacyType,
  TennatsRegistery,
} from "./tennats-registery.model.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const INPUTS_DIR = resolve(PROJECT_ROOT, "inputs");

const REGISTRY_FILE = resolve(INPUTS_DIR, "tennants-registery.json");
const PAYMENT_HISTORY_FILE = resolve(INPUTS_DIR, "payment-history.xlsx");

/** Payment-history column labels (canonical keys from the source file). */
const PAYMENT_COL = {
  apartment: "דירה",
  extendedDescription: "תאור מורחב",
  total: "בזכות",
  houseCommittee: "ועד",
  renovationFund: "קרן",
} as const;

/** Trim and treat whitespace-only / empty values as "no value". */
function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/** True when a cell holds no meaningful value. */
function isCellEmpty(value: unknown): boolean {
  return normalizeText(value) === "";
}

/** True when a cell holds no meaningful apartment value. */
function isApartmentMissing(value: unknown): boolean {
  return isCellEmpty(value);
}

/** Parse an apartment identifier into a number, or null if invalid. */
function parseApartment(value: unknown): ApartmentNumber | null {
  const text = normalizeText(value);
  if (text === "") return null;
  const apartment = Number(text);
  return Number.isFinite(apartment) ? apartment : null;
}

/**
 * Parse a monetary value into a number, or null if invalid.
 * Strips the currency symbol (₪) and thousands separators before parsing.
 */
function parseAmount(value: unknown): number | null {
  const text = normalizeText(value).replace(/₪/g, "").replace(/,/g, "").trim();
  if (text === "") return null;
  const amount = Number(text);
  return Number.isFinite(amount) ? amount : null;
}

/**
 * Extract the payer name from an extended payment description.
 * Format example: "העברה מאת קובי הרי עבור ועד הבית" -> "קובי הרי".
 * The name appears after the word "מאת" and before an optional "עבור" ("for") clause.
 */
function extractPayerName(extendedDescription: string): string {
  const FROM = "מאת";
  const PURPOSE = "עבור";
  const fromIndex = extendedDescription.indexOf(FROM);
  if (fromIndex === -1) return "";

  let rest = extendedDescription.slice(fromIndex + FROM.length);
  const purposeIndex = rest.indexOf(PURPOSE);
  if (purposeIndex !== -1) rest = rest.slice(0, purposeIndex);
  return normalizeText(rest);
}

function loadRegistry(): TennatsRegistery {
  const raw = readFileSync(REGISTRY_FILE, "utf8");
  return JSON.parse(raw) as TennatsRegistery;
}

interface PaymentSplit {
  /** Amount allocated to the house-committee (taxes) column. */
  house: number;
  /** Amount allocated to the renovation-fund column. */
  renovation: number;
}

/**
 * Split a total payment into its house-committee (taxes) and renovation-fund
 * parts based on the payer's tenancy type:
 * - Renter: the whole amount goes to taxes.
 * - Owner: the whole amount goes to the renovation fund.
 * - Both: taxes are filled up to the apartment's monthly taxes amount and the
 *   remainder goes to the renovation fund.
 *
 * Returns null when a "Both" split cannot be computed because the apartment
 * details (and therefore the taxes cap) are unknown.
 */
function splitPayment(
  total: number,
  tennancyType: TennacyType,
  details: ApartmentDetails | undefined,
): PaymentSplit | null {
  switch (tennancyType) {
    case "Renter":
      return { house: total, renovation: 0 };
    case "Owner":
      return { house: 0, renovation: total };
    case "Both": {
      if (details === undefined) return null;
      const house = Math.min(total, details.taxes);
      return { house, renovation: total - house };
    }
  }
}

interface FillResult {
  filledApartments: number;
  filledSplits: number;
  warnings: string[];
}

/**
 * Fill empty apartment cells in the payment-history sheet by resolving the
 * payer name (from the extended description) against the registry map, and fill
 * the taxes / renovation-fund columns by splitting the total amount according to
 * the payer's tenancy type. Cells are mutated in place so the rest of the
 * workbook is preserved.
 */
function fillMissingApartments(
  sheet: XLSX.WorkSheet,
  registry: TennatsRegistery,
): FillResult {
  const tenantToTennancy = registry["tenant-apartment-map"];
  const apartmentDetails = registry["apartment-detils"];
  const warnings: string[] = [];
  let filledApartments = 0;
  let filledSplits = 0;

  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
  const headerRow = range.s.r;

  // Map the canonical column labels to their spreadsheet column indexes.
  const columnIndex = new Map<string, number>();
  for (let c = range.s.c; c <= range.e.c; c++) {
    const headerCell = sheet[XLSX.utils.encode_cell({ r: headerRow, c })];
    const label = normalizeText(headerCell?.v);
    if (label !== "") columnIndex.set(label, c);
  }

  const apartmentCol = columnIndex.get(PAYMENT_COL.apartment);
  const descriptionCol = columnIndex.get(PAYMENT_COL.extendedDescription);
  const totalCol = columnIndex.get(PAYMENT_COL.total);
  const houseCommitteeCol = columnIndex.get(PAYMENT_COL.houseCommittee);
  const renovationCol = columnIndex.get(PAYMENT_COL.renovationFund);
  if (apartmentCol === undefined) {
    throw new Error(`Column "${PAYMENT_COL.apartment}" not found in payment history.`);
  }
  if (descriptionCol === undefined) {
    throw new Error(
      `Column "${PAYMENT_COL.extendedDescription}" not found in payment history.`,
    );
  }
  if (totalCol === undefined) {
    throw new Error(`Column "${PAYMENT_COL.total}" not found in payment history.`);
  }
  if (houseCommitteeCol === undefined) {
    throw new Error(
      `Column "${PAYMENT_COL.houseCommittee}" not found in payment history.`,
    );
  }
  if (renovationCol === undefined) {
    throw new Error(
      `Column "${PAYMENT_COL.renovationFund}" not found in payment history.`,
    );
  }

  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const apartmentRef = XLSX.utils.encode_cell({ r, c: apartmentCol });
    const houseRef = XLSX.utils.encode_cell({ r, c: houseCommitteeCol });
    const renovationRef = XLSX.utils.encode_cell({ r, c: renovationCol });

    const apartmentMissing = isApartmentMissing(sheet[apartmentRef]?.v);
    const splitMissing =
      isCellEmpty(sheet[houseRef]?.v) && isCellEmpty(sheet[renovationRef]?.v);

    // Nothing to do for rows that already have an apartment and a split.
    if (!apartmentMissing && !splitMissing) continue;

    const descriptionCell = sheet[XLSX.utils.encode_cell({ r, c: descriptionCol })];
    const description = normalizeText(descriptionCell?.v);

    // Skip fully empty rows (no description to resolve a payer from).
    if (description === "") continue;

    const payerName = extractPayerName(description);
    if (payerName === "") {
      warnings.push(
        `Row ${r + 1}: could not extract a payer name from "${description}".`,
      );
      continue;
    }

    const tennancy = tenantToTennancy[payerName];
    if (tennancy === undefined) {
      warnings.push(`Row ${r + 1}: payer "${payerName}" not found in the registry.`);
      continue;
    }

    if (apartmentMissing) {
      sheet[apartmentRef] = { t: "n", v: tennancy.apartmentNumber };
      filledApartments += 1;
    }

    if (splitMissing) {
      const apartment =
        parseApartment(sheet[apartmentRef]?.v) ?? tennancy.apartmentNumber;
      const total = parseAmount(
        sheet[XLSX.utils.encode_cell({ r, c: totalCol })]?.v,
      );
      if (total === null) {
        warnings.push(
          `Row ${r + 1}: payer "${payerName}" has no total amount to split into taxes/renovation.`,
        );
        continue;
      }

      const split = splitPayment(
        total,
        tennancy.tennancyType,
        apartmentDetails[apartment],
      );
      if (split === null) {
        warnings.push(
          `Row ${r + 1}: apartment ${apartment} details missing; cannot split "Both" payment for "${payerName}".`,
        );
        continue;
      }

      sheet[houseRef] = { t: "n", v: split.house };
      sheet[renovationRef] = { t: "n", v: split.renovation };
      filledSplits += 1;
    }
  }

  return { filledApartments, filledSplits, warnings };
}

function main(): void {
  const registry = loadRegistry();
  const workbook = XLSX.readFile(PAYMENT_HISTORY_FILE);
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("Payment history workbook has no sheets.");
  }

  const { filledApartments, filledSplits, warnings } = fillMissingApartments(
    workbook.Sheets[sheetName],
    registry,
  );

  if (filledApartments > 0 || filledSplits > 0) {
    XLSX.writeFile(workbook, PAYMENT_HISTORY_FILE);
    console.log(
      `Filled ${filledApartments} apartment value(s) and ${filledSplits} taxes/renovation split(s) in ${PAYMENT_HISTORY_FILE}`,
    );
  } else {
    console.log("No missing apartment or payment-split values to fill.");
  }

  if (warnings.length > 0) {
    console.warn(`\n${warnings.length} warning(s):`);
    for (const warning of warnings) console.warn(`  - ${warning}`);
  }
}

main();
