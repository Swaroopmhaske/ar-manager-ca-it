import type { ArData, Customer, Invoice, Paise } from "./types";
import { creditLimitCheck, type CreditLimitCheck } from "./attention";
import {
  documentTotal,
  dueDate,
  gstSplit,
  gstSplitByMode,
  isIntraState,
  nextNumber,
  type GstSplit,
} from "./documents";

/* ------------------------------------------------------------------ */
/* New invoice                                                         */
/* ------------------------------------------------------------------ */

export interface InvoiceInput {
  customerId: number;
  invoiceDate: string;
  taxable: Paise;
  gstRatePct: number;
}

export interface InvoiceDraft {
  customer: Customer | null;
  /** Problems that stop the invoice being saved. */
  errors: string[];
  invoiceNo: string;
  dueDate: string;
  /** CGST + SGST (Maharashtra) rather than IGST. */
  intraState: boolean;
  gst: GstSplit;
  total: Paise;
  /** R9: shown as a warning; never blocks saving. */
  creditLimit: CreditLimitCheck | null;
}

/**
 * Everything the "Create invoice" preview shows and the save action
 * writes: number (R4), due date (R2), GST split and total (R3), and the
 * credit-limit warning (R9). One function, so they can never disagree.
 */
export function draftInvoice(data: ArData, input: InvoiceInput): InvoiceDraft {
  const errors: string[] = [];
  const customer = data.customers.find((c) => c.id === input.customerId) ?? null;

  if (!customer) errors.push("Choose a customer.");
  else if (!customer.isActive) errors.push(`${customer.name} is inactive and cannot be given new invoices.`);
  if (!Number.isInteger(input.taxable) || input.taxable <= 0) errors.push("The taxable value must be more than zero.");
  if (!(input.gstRatePct >= 0 && input.gstRatePct <= 100)) errors.push("The GST rate must be between 0 and 100%.");

  const gst = gstSplit(customer?.state ?? null, Math.max(0, input.taxable), input.gstRatePct);
  const total = documentTotal(Math.max(0, input.taxable), gst);

  return {
    customer,
    errors,
    invoiceNo: nextNumber("invoice", data, input.invoiceDate),
    dueDate: customer ? dueDate(input.invoiceDate, customer.creditDays) : "",
    intraState: isIntraState(customer?.state ?? null),
    gst,
    total,
    creditLimit: customer ? creditLimitCheck(data, customer.id, input.invoiceDate, total) : null,
  };
}

/* ------------------------------------------------------------------ */
/* New credit note                                                     */
/* ------------------------------------------------------------------ */

export interface CreditNoteInput {
  invoiceId: number;
  creditNoteDate: string;
  taxable: Paise;
}

export interface CreditNoteDraft {
  invoice: Invoice | null;
  errors: string[];
  creditNoteNo: string;
  gst: GstSplit;
  total: Paise;
  /** What can still be credited: total − all allocations − all credit notes. */
  available: Paise;
}

/** R7: GST at the invoice's rate and split; allocations + credit notes ≤ total. */
export function draftCreditNote(data: ArData, input: CreditNoteInput): CreditNoteDraft {
  const errors: string[] = [];
  const invoice = data.invoices.find((i) => i.id === input.invoiceId) ?? null;

  const intraState = invoice ? invoice.igst === 0 && invoice.cgst + invoice.sgst > 0 : false;
  const gst = gstSplitByMode(intraState, Math.max(0, input.taxable), invoice?.gstRatePct ?? 0);
  const total = documentTotal(Math.max(0, input.taxable), gst);

  let available = 0;
  if (invoice) {
    const used =
      data.allocations.filter((a) => a.invoiceId === invoice.id).reduce((s, a) => s + a.amount, 0) +
      data.creditNotes.filter((c) => c.invoiceId === invoice.id).reduce((s, c) => s + c.total, 0);
    available = invoice.total - used;
  }

  if (!invoice) errors.push("Invoice not found.");
  else if (invoice.isCancelled) errors.push("A cancelled invoice cannot receive a credit note.");
  else {
    if (input.creditNoteDate < invoice.invoiceDate) errors.push("The credit note cannot be dated before the invoice.");
    if (total > available) {
      errors.push(
        `This credit note totals ₹${(total / 100).toFixed(2)} but only ₹${(available / 100).toFixed(2)} of ${invoice.invoiceNo} is still open.`
      );
    }
  }
  if (!Number.isInteger(input.taxable) || input.taxable <= 0) errors.push("The taxable value must be more than zero.");

  return {
    invoice,
    errors,
    creditNoteNo: nextNumber("creditNote", data, input.creditNoteDate),
    gst,
    total,
    available,
  };
}

/** A document-number clash from the database (two tabs saving at once, README 4.8). */
export function isDuplicateNumberError(message: string | undefined): boolean {
  return !!message && /duplicate key|unique constraint|already (exists|used)/i.test(message);
}
