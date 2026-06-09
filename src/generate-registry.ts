import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import XLSX from "xlsx";
import type {
  ApartmentDetails,
  ApartmentNumber,
  Tennancy,
  TennacyType,
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
  houseCommitteeFee: "מיסי ועד בית",
  renovationFund: "קרן שיפוצים",
} as const;

/** Payment-history column labels (canonical keys from the source file). */
const PAYMENT_COL = {
  apartment: "דירה",
  extendedDescription: "תאור מורחב",
  houseCommittee: "וועד בית",
  renovationFund: "קרן שיפוצים",
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
 * Parse a monetary charge field into a non-negative number, or null if invalid.
 * Strips the currency symbol (₪) and thousands separators before parsing.
 */
function parseAmount(value: unknown): number | null {
  const text = normalizeText(value).replace(/₪/g, "").replace(/,/g, "").trim();
  if (text === "") return null;
  const amount = Number(text);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
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
 * Registry accumulator.
 *
 * Tenancy type per tenant is derived from two sources, in priority order:
 * 1. Tenant list (`tennants-list.xlsx`): an explicit owner/tenant column says
 *    whether the person is an Owner or a Renter. For a non-rented apartment the
 *    only listed resident (the owner) pays Both.
 * 2. Payment history (`payment-history.xlsx`): for payers that never appear in
 *    the tenant list, the tenancy type is inferred from which charge types they
 *    actually paid (taxes only -> Renter, renovation only -> Owner, both -> Both).
 *    Payers in a non-rented apartment always pay Both.
 *
 * It also reports conflicting assignments (same person linked to two apartments).
 */
class RegistryBuilder {
  private readonly tenantToTennancy = new Map<TenantName, Tennancy>();
  private readonly apartments = new Set<ApartmentNumber>();
  private readonly apartmentDetails = new Map<ApartmentNumber, ApartmentDetails>();
  /** Payers seen only in payment history, with the charge types they paid. */
  private readonly paymentOnlyPayers = new Map<
    TenantName,
    { apartment: ApartmentNumber; paidTaxes: boolean; paidRenovation: boolean }
  >();
  readonly warnings: string[] = [];

  addApartment(apartment: ApartmentNumber): void {
    this.apartments.add(apartment);
  }

  setApartmentDetails(apartment: ApartmentNumber, details: ApartmentDetails): void {
    this.addApartment(apartment);
    this.apartmentDetails.set(apartment, details);
  }

  /** Record a tenant whose tenancy type is known explicitly from the tenant list. */
  addListedTenant(
    name: TenantName,
    apartment: ApartmentNumber,
    tennancyType: TennacyType,
    source: string,
  ): void {
    this.addApartment(apartment);
    const existing = this.tenantToTennancy.get(name);
    if (existing === undefined) {
      this.tenantToTennancy.set(name, { apartmentNumber: apartment, tennancyType });
      return;
    }
    if (existing.apartmentNumber !== apartment) {
      this.warnings.push(
        `"${name}" is linked to apartment ${existing.apartmentNumber} and ${apartment} (kept ${existing.apartmentNumber}; ignored ${source} apartment ${apartment}).`,
      );
    }
  }

  /**
   * Record a payment made by a payer parsed from the payment history. If the
   * payer is already known from the tenant list, the tenant list wins and only
   * an apartment conflict is reported. Otherwise the paid charge types are
   * accumulated so the tenancy type can be inferred later in build().
   */
  addPaymentPayer(
    name: TenantName,
    apartment: ApartmentNumber,
    paidTaxes: boolean,
    paidRenovation: boolean,
  ): void {
    this.addApartment(apartment);

    const listed = this.tenantToTennancy.get(name);
    if (listed !== undefined) {
      if (listed.apartmentNumber !== apartment) {
        this.warnings.push(
          `"${name}" is linked to apartment ${listed.apartmentNumber} and ${apartment} (kept ${listed.apartmentNumber}; ignored payment-history apartment ${apartment}).`,
        );
      }
      return;
    }

    const existing = this.paymentOnlyPayers.get(name);
    if (existing === undefined) {
      this.paymentOnlyPayers.set(name, { apartment, paidTaxes, paidRenovation });
      return;
    }
    if (existing.apartment !== apartment) {
      this.warnings.push(
        `"${name}" is linked to apartment ${existing.apartment} and ${apartment} (kept ${existing.apartment}; ignored payment-history apartment ${apartment}).`,
      );
      return;
    }
    existing.paidTaxes = existing.paidTaxes || paidTaxes;
    existing.paidRenovation = existing.paidRenovation || paidRenovation;
  }

  /** Infer tenancy type for payers that only appear in the payment history. */
  private resolvePaymentOnlyPayers(): void {
    for (const [name, payer] of this.paymentOnlyPayers) {
      const isRent = this.apartmentDetails.get(payer.apartment)?.isRent ?? false;
      let tennancyType: TennacyType;
      if (!isRent) {
        tennancyType = "Both";
      } else if (payer.paidTaxes && payer.paidRenovation) {
        tennancyType = "Both";
      } else if (payer.paidTaxes) {
        tennancyType = "Renter";
      } else if (payer.paidRenovation) {
        tennancyType = "Owner";
      } else {
        tennancyType = "Both";
        this.warnings.push(
          `"${name}" (apartment ${payer.apartment}) has payment history but no recognizable taxes or renovation charge; defaulted to Both.`,
        );
      }
      this.tenantToTennancy.set(name, {
        apartmentNumber: payer.apartment,
        tennancyType,
      });
    }
  }

  build(): TennatsRegistery {
    this.resolvePaymentOnlyPayers();
    return {
      "all-tenants": [...this.tenantToTennancy.keys()].sort((a, b) =>
        a.localeCompare(b, "he"),
      ),
      "all-apartments": [...this.apartments].sort((a, b) => a - b),
      "tenant-apartment-map": Object.fromEntries(this.tenantToTennancy),
      "apartment-detils": Object.fromEntries(
        [...this.apartmentDetails.entries()].sort((a, b) => a[0] - b[0]),
      ),
    };
  }
}

function collectFromTenantList(rows: SheetRow[], builder: RegistryBuilder): void {
  for (const row of rows) {
    const apartment = parseApartment(row[TENANT_COL.apartment]);
    if (apartment === null) continue;
    builder.addApartment(apartment);

    const houseCommitteeFee = parseAmount(row[TENANT_COL.houseCommitteeFee]);
    const renovationFund = parseAmount(row[TENANT_COL.renovationFund]);
    if (houseCommitteeFee === null) {
      builder.warnings.push(
        `Apartment ${apartment} has a missing or invalid "${TENANT_COL.houseCommitteeFee}" amount.`,
      );
    }
    if (renovationFund === null) {
      builder.warnings.push(
        `Apartment ${apartment} has a missing or invalid "${TENANT_COL.renovationFund}" amount.`,
      );
    }

    const ownerName = normalizeText(row[TENANT_COL.ownerName]);
    const tenantName = normalizeText(row[TENANT_COL.tenantName]);

    // The apartment is rented when a tenant (renter) name is present.
    const isRent = tenantName !== "";
    builder.setApartmentDetails(apartment, {
      taxes: houseCommitteeFee ?? 0,
      renovationFundAmount: renovationFund ?? 0,
      isRent,
    });

    // Collect the residents listed for the apartment. When the apartment is not
    // rented the owner pays both charges; when it is rented the owner pays the
    // owner charge and the tenant pays the renter charge.
    if (ownerName !== "") {
      builder.addListedTenant(
        ownerName,
        apartment,
        isRent ? "Owner" : "Both",
        "tenant-list (owner)",
      );
    }
    if (tenantName !== "") {
      builder.addListedTenant(tenantName, apartment, "Renter", "tenant-list (tenant)");
    }
    if (ownerName === "" && tenantName === "") {
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
    if (payerName === "") {
      builder.warnings.push(
        `Could not extract payer name from description: "${description}" (apartment ${apartment}).`,
      );
      continue;
    }

    // A positive amount in a charge column means this payment covered that charge.
    const paidTaxes = (parseAmount(row[PAYMENT_COL.houseCommittee]) ?? 0) > 0;
    const paidRenovation = (parseAmount(row[PAYMENT_COL.renovationFund]) ?? 0) > 0;
    builder.addPaymentPayer(payerName, apartment, paidTaxes, paidRenovation);
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
