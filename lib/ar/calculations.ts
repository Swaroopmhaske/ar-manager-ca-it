import type {
  Allocation,
  ArData,
  CreditNote,
  Invoice,
  Paise,
  Receipt,
} from "./types";
import { addDays,daysBetween, settlementValue } from "./date";

export type AgeingBucket =
  | "Not due"
  | "1-30"
  | "31-60"
  | "61-90"
  | "91-180"
  | "Over 180";

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
  ageing: Record<AgeingBucket, Paise>;
  overLimit: boolean;
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

export function bucketFor(
  daysPastDue: number
): AgeingBucket {
  if (daysPastDue <= 0) return "Not due";
  if (daysPastDue <= 30) return "1-30";
  if (daysPastDue <= 60) return "31-60";
  if (daysPastDue <= 90) return "61-90";
  if (daysPastDue <= 180) return "91-180";
  return "Over 180";
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
  const ageing: Record<AgeingBucket, Paise> = {
    "Not due": 0,
    "1-30": 0,
    "31-60": 0,
    "61-90": 0,
    "91-180": 0,
    "Over 180": 0,
  };

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
  ageing: Record<AgeingBucket, Paise>;
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