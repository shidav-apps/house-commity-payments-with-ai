import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import XLSX from "xlsx";
import type {
  ApartmentNumber,
  TenantName,
  TennatsRegistery,
} from "./tennats-registery.model.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const INPUTS_DIR = resolve(PROJECT_ROOT, "inputs");

const TENANT_LIST_FILE = resolve(INPUTS_DIR, "tennants-list.xlsx");
const PAYMENT_HISTORY_FILE = resolve(INPUTS_DIR, "payment-history.xlsx");
const OUTPUT_FILE = resolve(INPUTS_DIR, "tennants-registery.json");

/** Tenant-list column labels (canonical keys from the source file). */
const TENANT_COL = {
  apartment: "Appt",
  ownerName: "Name",
  tenantName: "שם השוכר",
} as const;

/** Payment-history column labels (canonical keys from the source file). */
const PAYMENT_COL = {
  apartment: "דירה",
  extendedDescription: "תאור מורחב",
} as const;

type SheetRow = Record<string, unknown>;

/** Trim and treat whitespace-only / empty values as "no value". */
function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/** Parse an apartment identifier into a number, or null if invalid. */
function parseApartment(value: unknown): ApartmentNumber | null {
  const text = normalizeText(value);
  if (text === "") return null;
  const apartment = Number(text);
  return Number.isFinite(apartment) ? apartment : null;
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

function readSheetRows(filePath: string): SheetRow[] {
  const workbook = XLSX.readFile(filePath);
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const sheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json<SheetRow>(sheet, { defval: null });
}

/**
 * Registry accumulator. Tracks each resident's apartment and reports any
 * conflicting assignments (same person linked to two different apartments).
 */
class RegistryBuilder {
  private readonly tenantToApartment = new Map<TenantName, ApartmentNumber>();
  private readonly apartments = new Set<ApartmentNumber>();
  readonly warnings: string[] = [];

  addApartment(apartment: ApartmentNumber): void {
    this.apartments.add(apartment);
  }

  addResident(name: TenantName, apartment: ApartmentNumber, source: string): void {
    this.addApartment(apartment);
    const existing = this.tenantToApartment.get(name);
    if (existing === undefined) {
      this.tenantToApartment.set(name, apartment);
      return;
    }
    if (existing !== apartment) {
      this.warnings.push(
        `"${name}" is linked to apartment ${existing} and ${apartment} (kept ${existing}; ignored ${source} apartment ${apartment}).`,
      );
    }
  }

  build(): TennatsRegistery {
    return {
      "all-tenants": [...this.tenantToApartment.keys()].sort((a, b) =>
        a.localeCompare(b, "he"),
      ),
      "all-apartments": [...this.apartments].sort((a, b) => a - b),
      "tenant-apartment-map": Object.fromEntries(this.tenantToApartment),
    };
  }
}

function collectFromTenantList(rows: SheetRow[], builder: RegistryBuilder): void {
  for (const row of rows) {
    const apartment = parseApartment(row[TENANT_COL.apartment]);
    if (apartment === null) continue;
    builder.addApartment(apartment);

    const tenantName = normalizeText(row[TENANT_COL.tenantName]);
    const ownerName = normalizeText(row[TENANT_COL.ownerName]);

    // If the apartment is rented (tenant name present), the tenant lives there;
    // otherwise the owner lives there.
    const resident = tenantName !== "" ? tenantName : ownerName;
    if (resident !== "") {
      builder.addResident(resident, apartment, "tenant-list");
    } else {
      builder.warnings.push(
        `Apartment ${apartment} has no owner or tenant name in the tenant list.`,
      );
    }
  }
}

function collectFromPaymentHistory(rows: SheetRow[], builder: RegistryBuilder): void {
  for (const row of rows) {
    const apartment = parseApartment(row[PAYMENT_COL.apartment]);
    if (apartment === null) continue;
    builder.addApartment(apartment);

    const description = normalizeText(row[PAYMENT_COL.extendedDescription]);
    if (description === "") continue;

    const payerName = extractPayerName(description);
    if (payerName !== "") {
      builder.addResident(payerName, apartment, "payment-history");
    } else {
      builder.warnings.push(
        `Could not extract payer name from description: "${description}" (apartment ${apartment}).`,
      );
    }
  }
}

function main(): void {
  const builder = new RegistryBuilder();

  collectFromTenantList(readSheetRows(TENANT_LIST_FILE), builder);
  collectFromPaymentHistory(readSheetRows(PAYMENT_HISTORY_FILE), builder);

  const registry = builder.build();
  writeFileSync(OUTPUT_FILE, JSON.stringify(registry, null, 2), "utf8");

  console.log(`Registry written to ${OUTPUT_FILE}`);
  console.log(
    `Apartments: ${registry["all-apartments"].length}, tenants: ${registry["all-tenants"].length}`,
  );
  if (builder.warnings.length > 0) {
    console.warn(`\n${builder.warnings.length} warning(s):`);
    for (const warning of builder.warnings) console.warn(`  - ${warning}`);
  }
}

main();
