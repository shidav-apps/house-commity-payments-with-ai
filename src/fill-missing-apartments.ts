import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import XLSX from "xlsx";
import type {
  ApartmentNumber,
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
} as const;

/** Trim and treat whitespace-only / empty values as "no value". */
function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/** True when a cell holds no meaningful apartment value. */
function isApartmentMissing(value: unknown): boolean {
  return normalizeText(value) === "";
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

interface FillResult {
  filled: number;
  warnings: string[];
}

/**
 * Fill empty apartment cells in the payment-history sheet by resolving the
 * payer name (from the extended description) against the registry map.
 * Cells are mutated in place so the rest of the workbook is preserved.
 */
function fillMissingApartments(
  sheet: XLSX.WorkSheet,
  registry: TennatsRegistery,
): FillResult {
  const tenantToApartment = registry["tenant-apartment-map"];
  const warnings: string[] = [];
  let filled = 0;

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
  if (apartmentCol === undefined) {
    throw new Error(`Column "${PAYMENT_COL.apartment}" not found in payment history.`);
  }
  if (descriptionCol === undefined) {
    throw new Error(
      `Column "${PAYMENT_COL.extendedDescription}" not found in payment history.`,
    );
  }

  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const apartmentRef = XLSX.utils.encode_cell({ r, c: apartmentCol });
    const apartmentCell = sheet[apartmentRef];
    if (!isApartmentMissing(apartmentCell?.v)) continue;

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

    const apartment: ApartmentNumber | undefined = tenantToApartment[payerName];
    if (apartment === undefined) {
      warnings.push(
        `Row ${r + 1}: payer "${payerName}" not found in the registry.`,
      );
      continue;
    }

    sheet[apartmentRef] = { t: "n", v: apartment };
    filled += 1;
  }

  return { filled, warnings };
}

function main(): void {
  const registry = loadRegistry();
  const workbook = XLSX.readFile(PAYMENT_HISTORY_FILE);
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("Payment history workbook has no sheets.");
  }

  const { filled, warnings } = fillMissingApartments(
    workbook.Sheets[sheetName],
    registry,
  );

  if (filled > 0) {
    XLSX.writeFile(workbook, PAYMENT_HISTORY_FILE);
    console.log(`Filled ${filled} missing apartment value(s) in ${PAYMENT_HISTORY_FILE}`);
  } else {
    console.log("No missing apartment values to fill.");
  }

  if (warnings.length > 0) {
    console.warn(`\n${warnings.length} warning(s):`);
    for (const warning of warnings) console.warn(`  - ${warning}`);
  }
}

main();
