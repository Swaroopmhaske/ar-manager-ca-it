/**
 * AR analyst / collections workbench.
 *
 * Everything here is built on the existing engine (invoice positions R11,
 * ageing, customer positions R13, promises and follow-ups R16, DSO R17).
 * It adds NO new financial figure: the only new things are two workflow
 * labels — Credit status and Attention — whose exact rules are below and in
 * the README. They sort work; they are not accounting or credit-risk scores.
 */
import type { ArData, Customer, Invoice, Note, Paise, Receipt } from "./types";
import {
  AGEING_BUCKETS,
  creditLimitUsedPct,
  customerPosition,
  invoicePosition,
  notePositions,
  type AgeingBucket,
  type CustomerPosition,
  type InvoicePosition,
  type PromiseStatus,
} from "./calculations";
import { dashboardSummary } from "./attention";

/* ------------------------------------------------------------------ */
/* Credit status (workflow indicator, not a credit assessment)         */
/* ------------------------------------------------------------------ */

export const CREDIT_STATUSES = ["Over Limit", "Near Limit", "Within Limit"] as const;
export type CreditStatus = (typeof CREDIT_STATUSES)[number];

/** Utilisation at or above this share of the limit is "Near Limit". */
export const NEAR_LIMIT_PCT = 80;

/**
 * Over Limit  — net balance (R13) above the credit limit (the R13 rule).
 * Near Limit  — not over, and net balance ≥ 80% of the limit.
 * Within Limit — everything else, including credit (Cr) balances.
 * Compared in whole paise, so there is no rounding at the 80% boundary.
 */
export function creditStatus(netBalance: Paise, creditLimit: Paise): CreditStatus {
  if (netBalance > creditLimit) return "Over Limit";
  if (netBalance > 0 && netBalance * 100 >= creditLimit * NEAR_LIMIT_PCT) return "Near Limit";
  return "Within Limit";
}

/* ------------------------------------------------------------------ */
/* Notes that apply to an invoice                                      */
/* ------------------------------------------------------------------ */

/**
 * A note recorded against an invoice applies to that invoice; a note with
 * no invoice is about the customer's account, so it applies to all of the
 * customer's invoices (e.g. C003's "will clear both FY 25-26 invoices").
 */
function appliesTo(note: Note, invoice: Invoice): boolean {
  return note.customerId === invoice.customerId && (note.invoiceId === null || note.invoiceId === invoice.id);
}

/* ------------------------------------------------------------------ */
/* Attention (workflow priority)                                       */
/* ------------------------------------------------------------------ */

export const ATTENTION_LEVELS = ["Critical", "High", "Normal"] as const;
export type Attention = (typeof ATTENTION_LEVELS)[number];

export interface AttentionInput {
  status: "Paid" | "Due" | "Overdue";
  daysPastDue: number;
  isPartPaid: boolean;
  isDisputed: boolean;
  /** Latest promise that applies to the invoice, as at D. */
  promiseStatus: PromiseStatus | null;
  followUpDue: boolean;
  customerCreditStatus: CreditStatus;
  /** The customer's unapplied credit (R13) as at D. */
  customerUnapplied: Paise;
}

export interface AttentionResult {
  /** null = nothing to act on (e.g. a not-due invoice with no signal). */
  level: Attention | null;
  reasons: string[];
}

/**
 * The exact rules (README "Attention rules"). The highest matching level wins;
 * every matching reason is listed so the analyst sees why.
 *
 * Critical — overdue AND any of: more than 90 days past due; a broken
 *            promise to pay; the customer is over its credit limit.
 * High     — overdue 46–90 days; OR a follow-up is due; OR overdue and
 *            disputed (needs resolving before it can be collected).
 * Normal   — any other overdue invoice (1–45 days); OR part-paid; OR
 *            disputed; OR a promise to pay is pending (or broken on an
 *            invoice not yet overdue); OR the customer
 *            holds unapplied credit (allocate it before chasing).
 * None     — open, not due, and none of the above: not on the worklist.
 */
export function attentionFor(i: AttentionInput): AttentionResult {
  const overdue = i.status === "Overdue";
  const critical: string[] = [];
  const high: string[] = [];
  const normal: string[] = [];

  if (overdue && i.daysPastDue > 90) critical.push(`${i.daysPastDue} days overdue (over 90)`);
  if (overdue && i.promiseStatus === "Broken") critical.push("Promise to pay broken");
  if (overdue && i.customerCreditStatus === "Over Limit") critical.push("Customer over credit limit");

  if (overdue && i.daysPastDue >= 46 && i.daysPastDue <= 90) high.push(`${i.daysPastDue} days overdue (46–90)`);
  if (i.followUpDue) high.push("Follow-up due");
  if (overdue && i.isDisputed) high.push("Disputed and overdue");

  if (overdue && i.daysPastDue <= 45) normal.push(`${i.daysPastDue} days overdue`);
  if (i.isPartPaid) normal.push("Part-paid");
  if (!overdue && i.isDisputed) normal.push("Disputed");
  if (!overdue && i.promiseStatus === "Broken") normal.push("Promise to pay broken");
  if (i.promiseStatus === "Pending") normal.push("Promise to pay pending");
  if (i.customerUnapplied > 0) normal.push("Customer has unapplied credit to allocate");

  const level: Attention | null = critical.length ? "Critical" : high.length ? "High" : normal.length ? "Normal" : null;
  return { level, reasons: [...critical, ...high, ...normal] };
}

/* ------------------------------------------------------------------ */
/* Worklist                                                            */
/* ------------------------------------------------------------------ */

export interface WorklistItem {
  position: InvoicePosition;
  customer: Customer;
  customerPosition: CustomerPosition;
  creditStatus: CreditStatus;
  /** Latest promise (by note date) that applies to this invoice, as at D. */
  promise: { note: Note; status: PromiseStatus } | null;
  /** Earliest open follow-up due on or before D that applies to this invoice. */
  followUp: Note | null;
  attention: Attention | null;
  reasons: string[];
}

/** One row per open (outstanding > 0, not cancelled) invoice dated on or before D. */
export function collectionItems(data: ArData, asOf: string): WorklistItem[] {
  const notes = notePositions(data, asOf); // notes dated ≤ D, with R16 statuses
  const customers = new Map(data.customers.map((c) => [c.id, c]));
  const positions = new Map<number, CustomerPosition>();
  const positionOf = (id: number) => {
    if (!positions.has(id)) positions.set(id, customerPosition(data, id, asOf));
    return positions.get(id)!;
  };

  return data.invoices
    .map((invoice) => invoicePosition(data, invoice, asOf))
    .filter((p): p is InvoicePosition => p !== null && p.outstanding > 0)
    .map((position) => {
      const customer = customers.get(position.invoice.customerId)!;
      const cp = positionOf(customer.id);
      const cs = creditStatus(cp.netBalance, customer.creditLimit);
      const relevant = notes.filter((n) => appliesTo(n.note, position.invoice));

      const promises = relevant
        .filter((n) => n.promiseStatus !== null)
        .sort((a, b) => b.note.noteDate.localeCompare(a.note.noteDate) || b.note.id - a.note.id);
      const promise = promises.length ? { note: promises[0].note, status: promises[0].promiseStatus! } : null;

      const followUps = relevant
        .filter((n) => n.followUpDue)
        .sort((a, b) => a.note.followUpDate!.localeCompare(b.note.followUpDate!));
      const followUp = followUps.length ? followUps[0].note : null;

      const { level, reasons } = attentionFor({
        status: position.status,
        daysPastDue: position.daysPastDue,
        isPartPaid: position.isPartPaid,
        isDisputed: position.invoice.isDisputed,
        promiseStatus: promise?.status ?? null,
        followUpDue: followUp !== null,
        customerCreditStatus: cs,
        customerUnapplied: cp.unappliedCredit,
      });

      return { position, customer, customerPosition: cp, creditStatus: cs, promise, followUp, attention: level, reasons };
    });
}

export interface WorklistFilter {
  customerId?: number | null;
  bucket?: AgeingBucket | null;
  status?: "Due" | "Overdue" | null;
  disputed?: "yes" | "no" | null;
  promise?: PromiseStatus | "None" | null;
  followUpDue?: boolean;
  creditStatus?: CreditStatus | null;
  attention?: Attention | null;
  /** false (default): only rows with an attention level; true: every open invoice. */
  includeAll?: boolean;
}

export function filterWorklist(items: WorklistItem[], f: WorklistFilter): WorklistItem[] {
  return items.filter((it) => {
    if (!f.includeAll && it.attention === null) return false;
    if (f.customerId && it.customer.id !== f.customerId) return false;
    if (f.bucket && it.position.bucket !== f.bucket) return false;
    if (f.status && it.position.status !== f.status) return false;
    if (f.disputed === "yes" && !it.position.invoice.isDisputed) return false;
    if (f.disputed === "no" && it.position.invoice.isDisputed) return false;
    if (f.promise === "None" && it.promise !== null) return false;
    if (f.promise && f.promise !== "None" && it.promise?.status !== f.promise) return false;
    if (f.followUpDue && it.followUp === null) return false;
    if (f.creditStatus && it.creditStatus !== f.creditStatus) return false;
    if (f.attention && it.attention !== f.attention) return false;
    return true;
  });
}

const RANK: Record<Attention, number> = { Critical: 0, High: 1, Normal: 2 };

export const WORKLIST_SORTS = ["priority", "outstanding", "days"] as const;
export type WorklistSort = (typeof WORKLIST_SORTS)[number];

/**
 * priority (default): attention level, then days past due, then outstanding.
 * outstanding: largest amount first.   days: longest overdue first.
 * Ties always fall back to invoice number.
 */
export function sortWorklist(items: WorklistItem[], mode: WorklistSort = "priority"): WorklistItem[] {
  const rank = (it: WorklistItem) => (it.attention === null ? 3 : RANK[it.attention]);
  const byNo = (a: WorklistItem, b: WorklistItem) =>
    a.position.invoice.invoiceNo.localeCompare(b.position.invoice.invoiceNo);
  const byDays = (a: WorklistItem, b: WorklistItem) => b.position.daysPastDue - a.position.daysPastDue;
  const byAmount = (a: WorklistItem, b: WorklistItem) => b.position.outstanding - a.position.outstanding;
  return [...items].sort((a, b) => {
    if (mode === "outstanding") return byAmount(a, b) || byDays(a, b) || byNo(a, b);
    if (mode === "days") return byDays(a, b) || byAmount(a, b) || byNo(a, b);
    return rank(a) - rank(b) || byDays(a, b) || byAmount(a, b) || byNo(a, b);
  });
}

/** Reads the worklist filter from URL parameters (shared by the page and the CSV). */
export function worklistFilterFromParams(p: Record<string, string | undefined | null>): WorklistFilter {
  const pick = <T extends string>(value: string | undefined | null, allowed: readonly T[]) =>
    allowed.includes(value as T) ? (value as T) : null;
  return {
    customerId: Number(p.customer) || null,
    bucket: pick(p.bucket, AGEING_BUCKETS),
    status: pick(p.status, ["Due", "Overdue"] as const),
    disputed: pick(p.disputed, ["yes", "no"] as const),
    promise: pick(p.promise, ["Kept", "Broken", "Pending", "None"] as const),
    followUpDue: p.followup === "due",
    creditStatus: pick(p.credit, CREDIT_STATUSES),
    attention: pick(p.attention, ATTENTION_LEVELS),
    includeAll: p.show === "all",
  };
}

/* ------------------------------------------------------------------ */
/* Customer view (credit controller)                                   */
/* ------------------------------------------------------------------ */

export interface CustomerCreditRow {
  customer: Customer;
  position: CustomerPosition;
  /** Net balance ÷ limit (the existing "limit used"). */
  utilisationPct: number;
  creditStatus: CreditStatus;
}

/** Every customer with something open, owed or held, most utilised first. */
export function customerCreditRows(data: ArData, asOf: string): CustomerCreditRow[] {
  return data.customers
    .map((customer) => {
      const position = customerPosition(data, customer.id, asOf);
      return {
        customer,
        position,
        utilisationPct: creditLimitUsedPct(position, customer.creditLimit),
        creditStatus: creditStatus(position.netBalance, customer.creditLimit),
      };
    })
    .filter((r) => r.position.outstanding !== 0 || r.position.unappliedCredit !== 0)
    .sort((a, b) => b.utilisationPct - a.utilisationPct || a.customer.code.localeCompare(b.customer.code));
}

/* ------------------------------------------------------------------ */
/* KPIs                                                                */
/* ------------------------------------------------------------------ */

export interface CollectionKpis {
  totalReceivables: Paise;
  overdue: Paise;
  overduePct: number;
  unappliedCredit: Paise;
  netReceivable: Paise;
  customersOverLimit: number;
  customersNearLimit: number;
  brokenPromises: number;
  followUpsDue: number;
  /** R17, from the existing dso() — not a new formula. */
  dso: number | null;
}

export function collectionKpis(data: ArData, asOf: string): CollectionKpis {
  const s = dashboardSummary(data, asOf);
  const notes = notePositions(data, asOf);
  const credit = data.customers.map((c) =>
    creditStatus(customerPosition(data, c.id, asOf).netBalance, c.creditLimit)
  );
  return {
    totalReceivables: s.totalOutstanding,
    overdue: s.overdue,
    overduePct: s.overduePct,
    unappliedCredit: s.unappliedCredit,
    netReceivable: s.netReceivable,
    customersOverLimit: credit.filter((c) => c === "Over Limit").length,
    customersNearLimit: credit.filter((c) => c === "Near Limit").length,
    brokenPromises: notes.filter((n) => n.promiseStatus === "Broken").length,
    followUpsDue: notes.filter((n) => n.followUpDue).length,
    dso: s.dso,
  };
}

/* ------------------------------------------------------------------ */
/* Customer 360                                                        */
/* ------------------------------------------------------------------ */

export type FollowUpState = "Due" | "Upcoming" | "Done" | null;

export interface ActivityItem {
  note: Note;
  invoiceNo: string | null;
  promiseStatus: PromiseStatus | null;
  followUpState: FollowUpState;
}

export interface Customer360 {
  creditLimit: Paise;
  netBalance: Paise;
  outstanding: Paise;
  overdue: Paise;
  notDue: Paise;
  unappliedCredit: Paise;
  utilisationPct: number;
  creditStatus: CreditStatus;
  oldestOverdue: InvoicePosition | null;
  openInvoices: number;
  overdueInvoices: number;
  brokenPromises: number;
  pendingPromises: number;
  followUpsDue: number;
  lastReceipt: { receipt: Receipt; settlement: Paise } | null;
  /** Notes dated ≤ D, newest first, with promise and follow-up states. */
  activity: ActivityItem[];
}

export function customer360(data: ArData, customerId: number, asOf: string): Customer360 {
  const customer = data.customers.find((c) => c.id === customerId)!;
  const position = customerPosition(data, customerId, asOf);
  const open = data.invoices
    .filter((i) => i.customerId === customerId)
    .map((i) => invoicePosition(data, i, asOf))
    .filter((p): p is InvoicePosition => p !== null && p.outstanding > 0);
  const overdue = open
    .filter((p) => p.status === "Overdue")
    .sort((a, b) => b.daysPastDue - a.daysPastDue || a.invoice.invoiceNo.localeCompare(b.invoice.invoiceNo));

  const receipts = data.receipts
    .filter((r) => r.customerId === customerId && r.receiptDate <= asOf)
    .sort((a, b) => b.receiptDate.localeCompare(a.receiptDate) || b.receiptNo.localeCompare(a.receiptNo));

  const invoiceNo = new Map(data.invoices.map((i) => [i.id, i.invoiceNo]));
  const activity = notePositions(data, asOf)
    .filter((n) => n.note.customerId === customerId)
    .sort((a, b) => b.note.noteDate.localeCompare(a.note.noteDate) || b.note.id - a.note.id)
    .map(
      (n): ActivityItem => ({
        note: n.note,
        invoiceNo: n.note.invoiceId === null ? null : invoiceNo.get(n.note.invoiceId) ?? null,
        promiseStatus: n.promiseStatus,
        followUpState:
          n.note.followUpDate === null ? null : n.note.followUpDone ? "Done" : n.followUpDue ? "Due" : "Upcoming",
      })
    );

  return {
    creditLimit: customer.creditLimit,
    netBalance: position.netBalance,
    outstanding: position.outstanding,
    overdue: position.overdue,
    notDue: position.ageing["Not due"],
    unappliedCredit: position.unappliedCredit,
    utilisationPct: creditLimitUsedPct(position, customer.creditLimit),
    creditStatus: creditStatus(position.netBalance, customer.creditLimit),
    oldestOverdue: overdue[0] ?? null,
    openInvoices: open.length,
    overdueInvoices: overdue.length,
    brokenPromises: activity.filter((a) => a.promiseStatus === "Broken").length,
    pendingPromises: activity.filter((a) => a.promiseStatus === "Pending").length,
    followUpsDue: activity.filter((a) => a.followUpState === "Due").length,
    lastReceipt: receipts.length
      ? { receipt: receipts[0], settlement: receipts[0].bankAmount + receipts[0].tdsAmount }
      : null,
    activity,
  };
}

/* ------------------------------------------------------------------ */
/* CSV export                                                          */
/* ------------------------------------------------------------------ */

export const WORKLIST_CSV_HEADER = [
  "Customer",
  "Invoice Number",
  "Invoice Date",
  "Due Date",
  "Outstanding",
  "Ageing Bucket",
  "Days Past Due",
  "Disputed",
  "Promise Status",
  "Follow-up Date",
  "Credit Status",
  "Attention Level",
  "Reasons",
] as const;

const plain = (p: Paise) => `${p < 0 ? "-" : ""}${Math.floor(Math.abs(p) / 100)}.${String(Math.abs(p) % 100).padStart(2, "0")}`;

/** One CSV row per worklist item, in the order given. Amounts are plain rupees. */
export function worklistCsvRows(items: WorklistItem[]): string[][] {
  return items.map((it) => [
    `${it.customer.code} ${it.customer.name}`,
    it.position.invoice.invoiceNo,
    it.position.invoice.invoiceDate,
    it.position.invoice.dueDate,
    plain(it.position.outstanding),
    it.position.bucket ?? "",
    String(it.position.daysPastDue),
    it.position.invoice.isDisputed ? "Yes" : "No",
    it.promise?.status ?? "",
    it.followUp?.followUpDate ?? "",
    it.creditStatus,
    it.attention ?? "",
    it.reasons.join("; "),
  ]);
}
