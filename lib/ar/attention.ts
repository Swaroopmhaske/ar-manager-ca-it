import type { ArData, Customer, Note, Paise } from "./types";
import {
  customerPosition,
  dso,
  invoicePosition,
  notePositions,
  sumAgeing,
  type Ageing,
  type CustomerPosition,
  type InvoicePosition,
} from "./calculations";

/* ------------------------------------------------------------------ */
/* Dashboard summary ("Overdue at a glance")                            */
/* ------------------------------------------------------------------ */

export interface DashboardSummary {
  totalOutstanding: Paise;
  unappliedCredit: Paise;
  netReceivable: Paise;
  overdue: Paise;
  /** Overdue as a whole percentage of total outstanding; 0 when nothing is outstanding. */
  overduePct: number;
  dso: number | null;
  overdueInvoiceCount: number;
  /** Totals row for the ageing table. */
  ageing: Ageing;
}

export function dashboardSummary(data: ArData, asOf: string): DashboardSummary {
  const positions = data.customers.map((c) => customerPosition(data, c.id, asOf));
  const sum = (pick: (p: CustomerPosition) => Paise) =>
    positions.reduce((total, p) => total + pick(p), 0);

  const totalOutstanding = sum((p) => p.outstanding);
  const unappliedCredit = sum((p) => p.unappliedCredit);
  const overdue = sum((p) => p.overdue);

  return {
    totalOutstanding,
    unappliedCredit,
    netReceivable: totalOutstanding - unappliedCredit,
    overdue,
    overduePct: totalOutstanding > 0 ? Math.round((overdue / totalOutstanding) * 100) : 0,
    dso: dso(data, asOf),
    overdueInvoiceCount: overdueInvoices(data, asOf).length,
    ageing: sumAgeing(positions.map((p) => p.ageing)),
  };
}

/** Overdue invoices, longest overdue first (ties by invoice number). */
export function overdueInvoices(data: ArData, asOf: string): InvoicePosition[] {
  return data.invoices
    .map((invoice) => invoicePosition(data, invoice, asOf))
    .filter((p): p is InvoicePosition => p !== null && p.status === "Overdue")
    .sort(
      (a, b) =>
        b.daysPastDue - a.daysPastDue ||
        a.invoice.invoiceNo.localeCompare(b.invoice.invoiceNo)
    );
}

/* ------------------------------------------------------------------ */
/* Needs attention                                                     */
/* ------------------------------------------------------------------ */

export interface CustomerItem {
  customer: Customer;
  position: CustomerPosition;
}

export interface NoteItem {
  customer: Customer;
  note: Note;
}

export interface NeedsAttention {
  overLimit: CustomerItem[];
  brokenPromises: NoteItem[];
  followUpsDue: NoteItem[];
  unappliedCredit: CustomerItem[];
}

/** Everything the "Needs attention" panel lists, as at asOf, straight from the data. */
export function needsAttention(data: ArData, asOf: string): NeedsAttention {
  const byId = new Map(data.customers.map((c) => [c.id, c]));
  const customers = [...data.customers].sort((a, b) => a.code.localeCompare(b.code));
  const positions = customers.map((customer) => ({
    customer,
    position: customerPosition(data, customer.id, asOf),
  }));

  const notes = notePositions(data, asOf);
  const toItem = (note: Note): NoteItem => ({ customer: byId.get(note.customerId)!, note });

  return {
    overLimit: positions.filter((p) => p.position.overLimit),
    brokenPromises: notes
      .filter((n) => n.promiseStatus === "Broken")
      .map((n) => toItem(n.note))
      .sort((a, b) => a.note.promiseDate!.localeCompare(b.note.promiseDate!)),
    followUpsDue: notes
      .filter((n) => n.followUpDue)
      .map((n) => toItem(n.note))
      .sort((a, b) => a.note.followUpDate!.localeCompare(b.note.followUpDate!)),
    unappliedCredit: positions.filter((p) => p.position.unappliedCredit > 0),
  };
}

/* ------------------------------------------------------------------ */
/* Credit-limit warning for a new invoice (R9)                         */
/* ------------------------------------------------------------------ */

export interface CreditLimitCheck {
  creditLimit: Paise;
  currentNetBalance: Paise;
  newInvoiceTotal: Paise;
  projectedNetBalance: Paise;
  /** True when the projected net balance is ABOVE the limit (equal is fine, as in R13). */
  exceedsLimit: boolean;
}

/**
 * Would a new invoice take the customer's net balance (R13, so unapplied
 * credit is already netted off) above the credit limit? Measured as at the
 * new invoice's date. This only informs a warning; it never blocks (R9).
 */
export function creditLimitCheck(
  data: ArData,
  customerId: number,
  invoiceDate: string,
  newInvoiceTotal: Paise
): CreditLimitCheck {
  const customer = data.customers.find((c) => c.id === customerId);
  const creditLimit = customer?.creditLimit ?? 0;
  const currentNetBalance = customerPosition(data, customerId, invoiceDate).netBalance;
  const projectedNetBalance = currentNetBalance + newInvoiceTotal;

  return {
    creditLimit,
    currentNetBalance,
    newInvoiceTotal,
    projectedNetBalance,
    exceedsLimit: projectedNetBalance > creditLimit,
  };
}
