import type {
  Allocation,
  ArData,
  CreditNote,
  Invoice,
  Paise,
  Note,
} from "./types";
import { addDays, daysBetween, settlementValue } from "./date";
import {
  bucketFor,
  emptyAgeing,
  type Ageing,
  type AgeingBucket,
} from "./ageing";

export { AGEING_BUCKETS, bucketFor, emptyAgeing, sumAgeing } from "./ageing";
export type { Ageing, AgeingBucket } from "./ageing";

export type InvoiceStatus = "Paid" | "Due" | "Overdue";

export interface InvoicePosition {
  invoice: Invoice;
  received: Paise;
  credited: Paise;
  outstanding: Paise;
  daysPastDue: number;
  status: InvoiceStatus;
  isPartPaid: boolean;
  bucket: AgeingBucket | null;
}

export interface CustomerPosition {
  customerId: number;
  outstanding: Paise;
  overdue: Paise;
  unappliedCredit: Paise;
  netBalance: Paise;
  ageing: Ageing;
  overLimit: boolean;
}

/**
 * Share of the credit limit in use, as a whole percentage.
 *
 * Based on NET balance (invoice outstanding − unapplied credit), the same
 * figure R13 uses for "over limit", so the percentage and the over-limit
 * flag can never disagree. Money already received but not yet allocated
 * reduces exposure. A credit (Cr) balance uses none of the limit: 0%.
 * A zero limit with a positive balance is reported as 100% (fully used).
 */
export function creditLimitUsedPct(
  position: CustomerPosition,
  creditLimit: Paise
): number {
  const used = Math.max(0, position.netBalance);

  if (creditLimit <= 0) {
    return used > 0 ? 100 : 0;
  }

  return Math.round((used / creditLimit) * 100);
}
function activeInvoiceAsOf(
  invoice: Invoice,
  asOf: string
): boolean {
  return (
    !invoice.isCancelled &&
    invoice.invoiceDate <= asOf
  );
}

function allocationsForInvoiceAsOf(
  allocations: Allocation[],
  invoiceId: number,
  asOf: string
): Paise {
  return allocations
    .filter(
      (allocation) =>
        allocation.invoiceId === invoiceId &&
        allocation.allocationDate <= asOf
    )
    .reduce((sum, allocation) => sum + allocation.amount, 0);
}

function creditNotesForInvoiceAsOf(
  creditNotes: CreditNote[],
  invoiceId: number,
  asOf: string
): Paise {
  return creditNotes
    .filter(
      (creditNote) =>
        creditNote.invoiceId === invoiceId &&
        creditNote.creditNoteDate <= asOf
    )
    .reduce((sum, creditNote) => sum + creditNote.total, 0);
}

export function invoicePosition(
  data: ArData,
  invoice: Invoice,
  asOf: string
): InvoicePosition | null {
  if (!activeInvoiceAsOf(invoice, asOf)) {
    return null;
  }

  const received = allocationsForInvoiceAsOf(
    data.allocations,
    invoice.id,
    asOf
  );

  const credited = creditNotesForInvoiceAsOf(
    data.creditNotes,
    invoice.id,
    asOf
  );

  const outstanding = Math.max(
    0,
    invoice.total - received - credited
  );

  const daysPastDue = daysBetween(
    invoice.dueDate,
    asOf
  );

  let status: InvoiceStatus;

  if (outstanding === 0) {
    status = "Paid";
  } else if (daysPastDue >= 1) {
    status = "Overdue";
  } else {
    status = "Due";
  }

  const isPartPaid =
    outstanding > 0 &&
    received + credited > 0;

  return {
    invoice,
    received,
    credited,
    outstanding,
    daysPastDue,
    status,
    isPartPaid,
    bucket:
      outstanding === 0
        ? null
        : bucketFor(daysPastDue),
  };
}


function unappliedCreditForCustomer(
  data: ArData,
  customerId: number,
  asOf: string
): Paise {
  const settlement = data.receipts
    .filter(
      (receipt) =>
        receipt.customerId === customerId &&
        receipt.receiptDate <= asOf
    )
    .reduce(
      (sum, receipt) =>
        sum +
        settlementValue(
          receipt.bankAmount,
          receipt.tdsAmount
        ),
      0
    );

  const allocated = data.allocations
    .filter(
      (allocation) =>
        allocation.allocationDate <= asOf &&
        data.receipts.some(
          (receipt) =>
            receipt.id === allocation.receiptId &&
            receipt.customerId === customerId &&
            receipt.receiptDate <= asOf
        )
    )
    .reduce(
      (sum, allocation) => sum + allocation.amount,
      0
    );

  return settlement - allocated;
}

export function customerPosition(
  data: ArData,
  customerId: number,
  asOf: string
): CustomerPosition {
  const ageing = emptyAgeing();

  let outstanding = 0;
  let overdue = 0;

  for (const invoice of data.invoices) {
    if (invoice.customerId !== customerId) {
      continue;
    }

    const position = invoicePosition(
      data,
      invoice,
      asOf
    );

    if (!position) continue;

    outstanding += position.outstanding;

    if (position.bucket) {
      ageing[position.bucket] +=
        position.outstanding;

      if (position.bucket !== "Not due") {
        overdue += position.outstanding;
      }
    }
  }

  const unappliedCredit =
    unappliedCreditForCustomer(
      data,
      customerId,
      asOf
    );

  const netBalance =
    outstanding - unappliedCredit;

  const customer = data.customers.find(
    (item) => item.id === customerId
  );

  const overLimit =
    customer !== undefined &&
    netBalance > customer.creditLimit;

  return {
    customerId,
    outstanding,
    overdue,
    unappliedCredit,
    netBalance,
    ageing,
    overLimit,
  };
}
/** R13 for every customer, in customer-code order. */
export function customerPositions(
  data: ArData,
  asOf: string
): CustomerPosition[] {
  return [...data.customers]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((customer) => customerPosition(data, customer.id, asOf));
}

/**
 * R14 as the brief names it: only the customers whose net balance differs
 * from the document formula. Must always be an empty list.
 */
export function balanceCheck(data: ArData, asOf: string): ControlCheck[] {
  return controlCheck(data, asOf).filter((check) => !check.passed);
}

export type ControlCheck = {
  customerId: number;
  expected: Paise;
  calculated: Paise;
  difference: Paise;
  passed: boolean;
};

export function controlCheck(
  data: ArData,
  asOf: string
): ControlCheck[] {
  return data.customers.map((customer) => {
    const customerInvoices = data.invoices.filter(
      (invoice) =>
        invoice.customerId === customer.id &&
        !invoice.isCancelled &&
        invoice.invoiceDate <= asOf
    );

    const invoiceTotals = customerInvoices.reduce(
      (sum, invoice) => sum + invoice.total,
      0
    );

    const creditNoteTotals = data.creditNotes
      .filter(
        (creditNote) =>
          customerInvoices.some(
            (invoice) => invoice.id === creditNote.invoiceId
          ) &&
          creditNote.creditNoteDate <= asOf
      )
      .reduce((sum, creditNote) => sum + creditNote.total, 0);

    const receiptSettlement = data.receipts
      .filter(
        (receipt) =>
          receipt.customerId === customer.id &&
          receipt.receiptDate <= asOf
      )
      .reduce(
        (sum, receipt) =>
          sum + settlementValue(receipt.bankAmount, receipt.tdsAmount),
        0
      );

    const expected =
      invoiceTotals -
      creditNoteTotals -
      receiptSettlement;

    const position = customerPosition(data, customer.id, asOf);

    const calculated = position.netBalance;
    const difference = calculated - expected;

    return {
      customerId: customer.id,
      expected,
      calculated,
      difference,
      passed: difference === 0,
    };
  });
}
export type StatementLineType =
  | "Invoice"
  | "Credit Note"
  | "Payment received"
  | "TDS deducted by you";

export type StatementLine = {
  date: string;
  type: StatementLineType;
  documentNo: string;
  debit: Paise;
  credit: Paise;
  balance: Paise;
};

export type StatementResult = {
  openingBalance: Paise;
  lines: StatementLine[];
  closingBalance: Paise;
  ageing: Ageing;
  unappliedCredit: Paise;
};

export function statement(
  data: ArData,
  customerId: number,
  from: string,
  to: string
): StatementResult {
  const openingBalance = customerPosition(
    data,
    customerId,
    addDays(from, -1)
  ).netBalance;

  const lines: Array<{
    date: string;
    type: StatementLineType;
    documentNo: string;
    debit: Paise;
    credit: Paise;
    order: number;
  }> = [];

  // Invoices
  for (const invoice of data.invoices) {
    if (
      invoice.customerId !== customerId ||
      invoice.isCancelled ||
      invoice.invoiceDate < from ||
      invoice.invoiceDate > to
    ) {
      continue;
    }

    lines.push({
      date: invoice.invoiceDate,
      type: "Invoice",
      documentNo: invoice.invoiceNo,
      debit: invoice.total,
      credit: 0,
      order: 1,
    });
  }

  // Credit notes
  for (const creditNote of data.creditNotes) {
    const invoice = data.invoices.find(
      (item) => item.id === creditNote.invoiceId
    );

    if (
      !invoice ||
      invoice.customerId !== customerId ||
      invoice.isCancelled ||
      creditNote.creditNoteDate < from ||
      creditNote.creditNoteDate > to
    ) {
      continue;
    }

    lines.push({
      date: creditNote.creditNoteDate,
      type: "Credit Note",
      documentNo: creditNote.creditNoteNo,
      debit: 0,
      credit: creditNote.total,
      order: 2,
    });
  }

  // Receipts
  for (const receipt of data.receipts) {
    if (
      receipt.customerId !== customerId ||
      receipt.receiptDate < from ||
      receipt.receiptDate > to
    ) {
      continue;
    }

    lines.push({
      date: receipt.receiptDate,
      type: "Payment received",
      documentNo: receipt.receiptNo,
      debit: 0,
      credit: receipt.bankAmount,
      order: 3,
    });

    if (receipt.tdsAmount > 0) {
      lines.push({
        date: receipt.receiptDate,
        type: "TDS deducted by you",
        documentNo: receipt.receiptNo,
        debit: 0,
        credit: receipt.tdsAmount,
        order: 4,
      });
    }
  }

  lines.sort((a, b) => {
    if (a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }

    if (a.order !== b.order) {
      return a.order - b.order;
    }

    return a.documentNo.localeCompare(b.documentNo);
  });

  let runningBalance = openingBalance;

  const statementLines = lines.map((line) => {
    runningBalance += line.debit;
    runningBalance -= line.credit;

    return {
      date: line.date,
      type: line.type,
      documentNo: line.documentNo,
      debit: line.debit,
      credit: line.credit,
      balance: runningBalance,
    };
  });

  const position = customerPosition(data, customerId, to);

  return {
    openingBalance,
    lines: statementLines,
    closingBalance: runningBalance,
    ageing: position.ageing,
    unappliedCredit: position.unappliedCredit,
  };
}
export type PromiseStatus = "Kept" | "Broken" | "Pending";

export type NotePosition = {
  note: Note;
  followUpDue: boolean;
  promiseStatus: PromiseStatus | null;
};

export function promiseStatus(
  data: ArData,
  note: Note,
  asOf: string
): PromiseStatus | null {
  // Notes dated after the as-at date do not exist yet.
  if (note.noteDate > asOf) {
    return null;
  }

  // A note without both promise date and promise amount has no promise.
  if (note.promiseDate === null || note.promiseAmount === null) {
    return null;
  }

  const endDate =
    note.promiseDate < asOf ? note.promiseDate : asOf;

  const settlementReceived = data.receipts
    .filter(
      (receipt) =>
        receipt.customerId === note.customerId &&
        receipt.receiptDate >= note.noteDate &&
        receipt.receiptDate <= endDate
    )
    .reduce(
      (sum, receipt) =>
        sum + settlementValue(
          receipt.bankAmount,
          receipt.tdsAmount
        ),
      0
    );

  if (settlementReceived >= note.promiseAmount) {
    return "Kept";
  }

  if (note.promiseDate < asOf) {
    return "Broken";
  }

  return "Pending";
}

export function notePositions(
  data: ArData,
  asOf: string
): NotePosition[] {
  return data.notes
    .filter((note) => note.noteDate <= asOf)
    .map((note) => ({
      note,
      followUpDue:
        note.followUpDate !== null &&
        note.followUpDate <= asOf &&
        !note.followUpDone,
      promiseStatus: promiseStatus(data, note, asOf),
    }));
}
export function dso(
  data: ArData,
  asOf: string
): number | null {
  const windowStart = addDays(asOf, -89);

  const invoiceBase = data.invoices
    .filter(
      (invoice) =>
        !invoice.isCancelled &&
        invoice.invoiceDate >= windowStart &&
        invoice.invoiceDate <= asOf
    )
    .reduce((sum, invoice) => sum + invoice.total, 0);

  const creditNoteBase = data.creditNotes
    .filter(
      (creditNote) =>
        creditNote.creditNoteDate >= windowStart &&
        creditNote.creditNoteDate <= asOf
    )
    .reduce((sum, creditNote) => sum + creditNote.total, 0);

  const s = invoiceBase - creditNoteBase;

  if (s === 0) {
    return null;
  }

  const outstanding = data.invoices
    .filter(
      (invoice) =>
        !invoice.isCancelled &&
        invoice.invoiceDate <= asOf
    )
    .reduce((sum, invoice) => {
      const position = invoicePosition(
        data,
        invoice,
        asOf
      );

      return sum + (position?.outstanding ?? 0);
    }, 0);

  return Math.round((outstanding / s) * 90);
}