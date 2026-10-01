import type { ArData, Customer, Invoice, Paise } from "./types";
import {
  creditLimitUsedPct,
  customerPosition,
  invoicePosition,
  type AgeingBucket,
  type CustomerPosition,
} from "./calculations";

/* ------------------------------------------------------------------ */
/* Sorting helper shared by both lists                                  */
/* ------------------------------------------------------------------ */

export type SortDirection = "asc" | "desc";

export function compareValues(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "en-IN", { numeric: true });
}

/* ------------------------------------------------------------------ */
/* Invoice list                                                        */
/* ------------------------------------------------------------------ */

export type InvoiceListStatus = "Paid" | "Due" | "Overdue" | "Cancelled";

export interface InvoiceListRow {
  invoice: Invoice;
  customerCode: string;
  customerName: string;
  received: Paise;
  credited: Paise;
  outstanding: Paise;
  /** Days past due while overdue; 0 when not overdue (or cancelled). */
  daysLate: number;
  status: InvoiceListStatus;
  isPartPaid: boolean;
  isDisputed: boolean;
  bucket: AgeingBucket | null;
}

/**
 * Every invoice dated on or before asOf, INCLUDING cancelled ones (R8:
 * a cancelled invoice keeps its number and appears with status
 * Cancelled). Cancelled rows carry zero amounts and are left out of
 * `invoiceListTotals`, so they never reach a total.
 */
export function invoiceListRows(data: ArData, asOf: string): InvoiceListRow[] {
  const customers = new Map(data.customers.map((c) => [c.id, c]));

  return data.invoices
    .filter((invoice) => invoice.invoiceDate <= asOf)
    .map((invoice): InvoiceListRow => {
      const customer = customers.get(invoice.customerId);
      const base = {
        invoice,
        customerCode: customer?.code ?? "",
        customerName: customer?.name ?? "",
        isDisputed: invoice.isDisputed,
      };

      if (invoice.isCancelled) {
        return {
          ...base,
          received: 0,
          credited: 0,
          outstanding: 0,
          daysLate: 0,
          status: "Cancelled",
          isPartPaid: false,
          bucket: null,
        };
      }

      const position = invoicePosition(data, invoice, asOf)!;
      return {
        ...base,
        received: position.received,
        credited: position.credited,
        outstanding: position.outstanding,
        daysLate: position.status === "Overdue" ? position.daysPastDue : 0,
        status: position.status,
        isPartPaid: position.isPartPaid,
        bucket: position.bucket,
      };
    });
}

export interface InvoiceFilter {
  /** Searches the invoice number. */
  q?: string;
  customerId?: number | null;
  status?: InvoiceListStatus | "All";
  disputed?: "all" | "yes" | "no";
  /** Inclusive invoice-date range, 'YYYY-MM-DD'. */
  from?: string;
  to?: string;
}

export const INVOICE_STATUSES: (InvoiceListStatus | "All")[] = ["All", "Due", "Overdue", "Paid", "Cancelled"];

const isDateParam = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Reads list filters from URL parameters (shared by the page and its CSV export). */
export function invoiceFilterFromParams(params: {
  q?: string | null;
  customer?: string | null;
  status?: string | null;
  disputed?: string | null;
  from?: string | null;
  to?: string | null;
}): InvoiceFilter {
  const status = params.status as InvoiceListStatus | "All";
  return {
    q: params.q ?? undefined,
    customerId: Number(params.customer) || null,
    status: INVOICE_STATUSES.includes(status) ? status : "All",
    disputed: params.disputed === "yes" || params.disputed === "no" ? params.disputed : "all",
    from: isDateParam(params.from ?? undefined) ? params.from! : undefined,
    to: isDateParam(params.to ?? undefined) ? params.to! : undefined,
  };
}

export function filterInvoiceRows(
  rows: InvoiceListRow[],
  filter: InvoiceFilter
): InvoiceListRow[] {
  const q = (filter.q ?? "").trim().toLowerCase();

  return rows.filter((row) => {
    if (q && !row.invoice.invoiceNo.toLowerCase().includes(q)) return false;
    if (filter.customerId && row.invoice.customerId !== filter.customerId) return false;
    if (filter.status && filter.status !== "All" && row.status !== filter.status) return false;
    if (filter.disputed === "yes" && !row.isDisputed) return false;
    if (filter.disputed === "no" && row.isDisputed) return false;
    if (filter.from && row.invoice.invoiceDate < filter.from) return false;
    if (filter.to && row.invoice.invoiceDate > filter.to) return false;
    return true;
  });
}

export const INVOICE_SORT_KEYS = [
  "invoiceNo",
  "customer",
  "invoiceDate",
  "dueDate",
  "total",
  "received",
  "credited",
  "outstanding",
  "status",
  "daysLate",
] as const;

export type InvoiceSortKey = (typeof INVOICE_SORT_KEYS)[number];

export function isInvoiceSortKey(value: unknown): value is InvoiceSortKey {
  return INVOICE_SORT_KEYS.includes(value as InvoiceSortKey);
}

export function invoiceSortValue(row: InvoiceListRow, key: InvoiceSortKey): string | number {
  switch (key) {
    case "invoiceNo": return row.invoice.invoiceNo;
    case "customer": return row.customerName;
    case "invoiceDate": return row.invoice.invoiceDate;
    case "dueDate": return row.invoice.dueDate;
    case "total": return row.invoice.total;
    case "received": return row.received;
    case "credited": return row.credited;
    case "outstanding": return row.outstanding;
    case "status": return row.status;
    case "daysLate": return row.daysLate;
  }
}

/** Returns a new, reordered array; ties fall back to invoice number. */
export function sortInvoiceRows(
  rows: InvoiceListRow[],
  key: InvoiceSortKey,
  direction: SortDirection
): InvoiceListRow[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...rows].sort(
    (a, b) =>
      sign * compareValues(invoiceSortValue(a, key), invoiceSortValue(b, key)) ||
      compareValues(a.invoice.invoiceNo, b.invoice.invoiceNo)
  );
}

export interface InvoiceListTotals {
  count: number;
  total: Paise;
  received: Paise;
  credited: Paise;
  outstanding: Paise;
}

/** Totals for a (filtered) list. Cancelled invoices are counted but never summed (R8). */
export function invoiceListTotals(rows: InvoiceListRow[]): InvoiceListTotals {
  const totals: InvoiceListTotals = { count: rows.length, total: 0, received: 0, credited: 0, outstanding: 0 };
  for (const row of rows) {
    if (row.status === "Cancelled") continue;
    totals.total += row.invoice.total;
    totals.received += row.received;
    totals.credited += row.credited;
    totals.outstanding += row.outstanding;
  }
  return totals;
}

/* ------------------------------------------------------------------ */
/* Customer list                                                       */
/* ------------------------------------------------------------------ */

export interface CustomerListRow {
  customer: Customer;
  position: CustomerPosition;
  limitUsedPct: number;
}

export function customerListRows(data: ArData, asOf: string): CustomerListRow[] {
  return data.customers.map((customer) => {
    const position = customerPosition(data, customer.id, asOf);
    return {
      customer,
      position,
      limitUsedPct: creditLimitUsedPct(position, customer.creditLimit),
    };
  });
}

export interface CustomerFilter {
  /** Searches code, name, contact person and email. */
  q?: string;
  active?: "all" | "active" | "inactive";
}

export function filterCustomerRows(
  rows: CustomerListRow[],
  filter: CustomerFilter
): CustomerListRow[] {
  const q = (filter.q ?? "").trim().toLowerCase();

  return rows.filter(({ customer }) => {
    if (filter.active === "active" && !customer.isActive) return false;
    if (filter.active === "inactive" && customer.isActive) return false;
    if (!q) return true;
    return [customer.code, customer.name, customer.contactPerson, customer.email]
      .some((field) => (field ?? "").toLowerCase().includes(q));
  });
}

export const CUSTOMER_SORT_KEYS = [
  "code",
  "name",
  "location",
  "contact",
  "creditDays",
  "creditLimit",
  "balance",
  "overdue",
  "limitUsed",
  "status",
] as const;

export type CustomerSortKey = (typeof CUSTOMER_SORT_KEYS)[number];

export function isCustomerSortKey(value: unknown): value is CustomerSortKey {
  return CUSTOMER_SORT_KEYS.includes(value as CustomerSortKey);
}

export function customerSortValue(row: CustomerListRow, key: CustomerSortKey): string | number {
  const c = row.customer;
  switch (key) {
    case "code": return c.code;
    case "name": return c.name;
    case "location": return `${c.city ?? ""}, ${c.state ?? ""}`;
    case "contact": return c.contactPerson ?? "";
    case "creditDays": return c.creditDays;
    case "creditLimit": return c.creditLimit;
    case "balance": return row.position.netBalance;
    case "overdue": return row.position.overdue;
    case "limitUsed": return row.limitUsedPct;
    case "status": return c.isActive ? "Active" : "Inactive";
  }
}

/** Returns a new, reordered array; ties fall back to customer code. */
export function sortCustomerRows(
  rows: CustomerListRow[],
  key: CustomerSortKey,
  direction: SortDirection
): CustomerListRow[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...rows].sort(
    (a, b) =>
      sign * compareValues(customerSortValue(a, key), customerSortValue(b, key)) ||
      compareValues(a.customer.code, b.customer.code)
  );
}

/* ------------------------------------------------------------------ */
/* Receipt list                                                        */
/* ------------------------------------------------------------------ */

export interface ReceiptListRow {
  receipt: import("./types").Receipt;
  customerCode: string;
  customerName: string;
  settlement: Paise;
  /** Allocated from this receipt with allocation_date ≤ asOf (R10). */
  allocated: Paise;
  /** Unapplied as at asOf. */
  unapplied: Paise;
  /** Allocations of ANY date: a receipt can be deleted only when this is 0. */
  allocationCount: number;
}

/** Receipts dated on or before asOf, newest first. */
export function receiptListRows(data: ArData, asOf: string): ReceiptListRow[] {
  const customers = new Map(data.customers.map((c) => [c.id, c]));
  return data.receipts
    .filter((r) => r.receiptDate <= asOf)
    .map((receipt) => {
      const mine = data.allocations.filter((a) => a.receiptId === receipt.id);
      const allocated = mine
        .filter((a) => a.allocationDate <= asOf)
        .reduce((s, a) => s + a.amount, 0);
      const settlement = receipt.bankAmount + receipt.tdsAmount;
      const customer = customers.get(receipt.customerId);
      return {
        receipt,
        customerCode: customer?.code ?? "",
        customerName: customer?.name ?? "",
        settlement,
        allocated,
        unapplied: settlement - allocated,
        allocationCount: mine.length,
      };
    })
    .sort(
      (a, b) =>
        b.receipt.receiptDate.localeCompare(a.receipt.receiptDate) ||
        b.receipt.receiptNo.localeCompare(a.receipt.receiptNo)
    );
}

export function receiptListTotals(rows: ReceiptListRow[]) {
  return rows.reduce(
    (t, r) => ({
      bank: t.bank + r.receipt.bankAmount,
      tds: t.tds + r.receipt.tdsAmount,
      settlement: t.settlement + r.settlement,
      allocated: t.allocated + r.allocated,
      unapplied: t.unapplied + r.unapplied,
    }),
    { bank: 0, tds: 0, settlement: 0, allocated: 0, unapplied: 0 }
  );
}
