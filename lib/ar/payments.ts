import type { ArData, Invoice, Paise } from "./types";
import { settlementValue } from "./date";

/* ------------------------------------------------------------------ */
/* Open invoices for a payment                                         */
/* ------------------------------------------------------------------ */

export interface OpenInvoice {
  invoice: Invoice;
  /**
   * What can still be allocated: total − ALL allocations − ALL credit
   * notes, whatever their date. R6's limit ("allocations plus credit
   * notes cannot exceed the total") applies to every record, not only
   * those dated before the payment.
   */
  open: Paise;
  /** The taxable part of `open`, net of credit notes (used for TDS). */
  taxableOpen: Paise;
}

/**
 * The customer's invoices that can take an allocation dated `date`:
 * not cancelled, invoice date on or before `date` (R6), something still
 * open. Sorted oldest first: due date, then invoice number (R6).
 */
export function openInvoicesForPayment(
  data: ArData,
  customerId: number,
  date: string
): OpenInvoice[] {
  const allocated = new Map<number, Paise>();
  for (const a of data.allocations) {
    allocated.set(a.invoiceId, (allocated.get(a.invoiceId) ?? 0) + a.amount);
  }
  const credited = new Map<number, { total: Paise; taxable: Paise }>();
  for (const c of data.creditNotes) {
    const prev = credited.get(c.invoiceId) ?? { total: 0, taxable: 0 };
    credited.set(c.invoiceId, {
      total: prev.total + c.total,
      taxable: prev.taxable + c.taxableValue,
    });
  }

  return data.invoices
    .filter(
      (i) => i.customerId === customerId && !i.isCancelled && i.invoiceDate <= date
    )
    .map((invoice) => {
      const cn = credited.get(invoice.id) ?? { total: 0, taxable: 0 };
      const netTotal = invoice.total - cn.total;
      const netTaxable = invoice.taxableValue - cn.taxable;
      const open = netTotal - (allocated.get(invoice.id) ?? 0);
      const taxableOpen =
        netTotal > 0 ? Math.round((open * netTaxable) / netTotal) : 0;
      return { invoice, open, taxableOpen };
    })
    .filter((row) => row.open > 0)
    .sort(
      (a, b) =>
        a.invoice.dueDate.localeCompare(b.invoice.dueDate) ||
        a.invoice.invoiceNo.localeCompare(b.invoice.invoiceNo)
    );
}

/* ------------------------------------------------------------------ */
/* TDS pre-fill (R5)                                                   */
/* ------------------------------------------------------------------ */

/**
 * Expected TDS for a bank amount, used only to PRE-FILL the form (R5);
 * the user always saves what the customer actually deducted.
 *
 * TDS is the customer's rate applied to the taxable value. A customer
 * paying an invoice in full sends (open − TDS) by bank, so the bank
 * amount is walked oldest first against each invoice's "cash due":
 * fully covered invoices contribute their full TDS, a part-covered
 * invoice contributes a proportional share, and any bank amount left
 * over (an advance) carries no TDS because no taxable value is known.
 */
export function expectedTds(
  openInvoices: OpenInvoice[],
  bankAmount: Paise,
  tdsRatePct: number
): Paise {
  if (bankAmount <= 0 || tdsRatePct <= 0) return 0;

  let remaining = bankAmount;
  let tds = 0;

  for (const row of openInvoices) {
    if (remaining <= 0) break;
    const fullTds = Math.round((row.taxableOpen * tdsRatePct) / 100);
    const cashDue = row.open - fullTds;
    if (cashDue <= 0) continue;

    if (remaining >= cashDue) {
      tds += fullTds;
      remaining -= cashDue;
    } else {
      tds += Math.round((fullTds * remaining) / cashDue);
      remaining = 0;
    }
  }

  return tds;
}

/* ------------------------------------------------------------------ */
/* Oldest-first suggestion (R6)                                        */
/* ------------------------------------------------------------------ */

export interface AllocationLine {
  invoiceId: number;
  amount: Paise;
}

/** Fills the oldest invoices first until the amount runs out. */
export function suggestAllocation(
  openInvoices: OpenInvoice[],
  available: Paise
): AllocationLine[] {
  let remaining = Math.max(0, available);
  const lines: AllocationLine[] = [];

  for (const row of openInvoices) {
    if (remaining <= 0) break;
    const amount = Math.min(row.open, remaining);
    lines.push({ invoiceId: row.invoice.id, amount });
    remaining -= amount;
  }

  return lines;
}

/** Settlement value minus what is allocated: what stays as unapplied credit. */
export function unappliedAfter(
  bankAmount: Paise,
  tdsAmount: Paise,
  lines: AllocationLine[]
): Paise {
  return (
    settlementValue(bankAmount, tdsAmount) -
    lines.reduce((sum, line) => sum + line.amount, 0)
  );
}

/* ------------------------------------------------------------------ */
/* Validation before saving (R6)                                       */
/* ------------------------------------------------------------------ */

const rupees = (p: Paise) =>
  (p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface AllocationRequest {
  customerId: number;
  receiptDate: string;
  allocationDate: string;
  /** How much of the receipt is still free to allocate. */
  available: Paise;
  lines: AllocationLine[];
}

/**
 * Checks proposed allocations against R6 before anything is written.
 * Returns plain-language problems; an empty list means OK.
 * Zero-amount lines are ignored (the user cleared that invoice).
 */
export function validateAllocations(data: ArData, req: AllocationRequest): string[] {
  const errors: string[] = [];
  const lines = req.lines.filter((line) => line.amount !== 0);

  if (req.allocationDate < req.receiptDate) {
    errors.push("The allocation date cannot be earlier than the receipt date.");
  }

  const seen = new Set<number>();
  const open = new Map(
    openInvoicesForPayment(data, req.customerId, "9999-12-31").map((r) => [r.invoice.id, r.open])
  );
  let sum = 0;

  for (const line of lines) {
    const invoice = data.invoices.find((i) => i.id === line.invoiceId);
    const label = invoice?.invoiceNo ?? `#${line.invoiceId}`;

    if (!Number.isInteger(line.amount) || line.amount < 0) {
      errors.push(`${label}: the amount must be a positive figure in rupees and paise.`);
      continue;
    }
    if (seen.has(line.invoiceId)) {
      errors.push(`${label} appears more than once.`);
      continue;
    }
    seen.add(line.invoiceId);
    sum += line.amount;

    if (!invoice) {
      errors.push(`${label} does not exist.`);
    } else if (invoice.customerId !== req.customerId) {
      errors.push(`${label} belongs to a different customer.`);
    } else if (invoice.isCancelled) {
      errors.push(`${label} is cancelled and cannot receive a payment.`);
    } else if (invoice.invoiceDate > req.allocationDate) {
      errors.push(`${label} is dated after the allocation date.`);
    } else if (line.amount > (open.get(invoice.id) ?? 0)) {
      errors.push(
        `${label} has only ₹${rupees(open.get(invoice.id) ?? 0)} left to allocate.`
      );
    }
  }

  if (sum > req.available) {
    errors.push(
      `The allocations total ₹${rupees(sum)}, more than the ₹${rupees(req.available)} available on this receipt.`
    );
  }

  return errors;
}

/** Settlement value of a receipt minus everything allocated from it (any date). */
export function receiptAvailable(data: ArData, receiptId: number): Paise {
  const receipt = data.receipts.find((r) => r.id === receiptId);
  if (!receipt) return 0;
  const allocated = data.allocations
    .filter((a) => a.receiptId === receiptId)
    .reduce((sum, a) => sum + a.amount, 0);
  return settlementValue(receipt.bankAmount, receipt.tdsAmount) - allocated;
}

/** R6 correction rule: only a receipt with no allocations can be deleted. */
export function canDeleteReceipt(
  data: ArData,
  receiptId: number
): { ok: true } | { ok: false; reason: string } {
  const count = data.allocations.filter((a) => a.receiptId === receiptId).length;
  if (count > 0) {
    return {
      ok: false,
      reason: `This receipt still has ${count} allocation${count === 1 ? "" : "s"}. Remove ${count === 1 ? "it" : "them"} first.`,
    };
  }
  return { ok: true };
}
