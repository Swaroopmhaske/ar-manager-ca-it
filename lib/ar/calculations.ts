import type {
  Allocation,
  ArData,
  CreditNote,
  Invoice,
  Paise,
  Receipt,
} from "./types";
import { daysBetween, settlementValue } from "./date";

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