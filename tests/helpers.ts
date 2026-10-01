import sample from "./fixtures/sample.json";
import type {
  ArData,
  Customer,
  Invoice,
  Note,
  Receipt,
} from "@/lib/ar/types";

export const toPaise = (rupees: number): number => Math.round(rupees * 100);

/** The sample-data fixture, converted exactly as lib/ar/load.ts converts live data. */
export function makeData(): ArData {
  return {
    customers: sample.customers.map(
      (row): Customer => ({
        id: row.id,
        code: row.code,
        name: row.name,
        city: row.city,
        state: row.state,
        contactPerson: row.contact_person,
        email: row.email,
        phone: row.phone,
        gstin: row.gstin,
        creditDays: row.credit_days,
        creditLimit: toPaise(Number(row.credit_limit)),
        tdsRatePct: Number(row.tds_rate_pct),
        isActive: row.is_active,
      })
    ),

    invoices: sample.invoices.map(
      (row): Invoice => ({
        id: row.id,
        invoiceNo: row.invoice_no,
        customerId: row.customer_id,
        invoiceDate: row.invoice_date,
        dueDate: row.due_date,
        description: row.description,
        taxableValue: toPaise(Number(row.taxable_value)),
        gstRatePct: Number(row.gst_rate_pct),
        cgst: toPaise(Number(row.cgst)),
        sgst: toPaise(Number(row.sgst)),
        igst: toPaise(Number(row.igst)),
        total: toPaise(Number(row.total)),
        isCancelled: row.is_cancelled,
        isDisputed: row.is_disputed,
      })
    ),

    creditNotes: sample.credit_notes.map((row) => ({
      id: row.id,
      creditNoteNo: row.credit_note_no,
      invoiceId: row.invoice_id,
      creditNoteDate: row.credit_note_date,
      taxableValue: toPaise(Number(row.taxable_value)),
      cgst: toPaise(Number(row.cgst)),
      sgst: toPaise(Number(row.sgst)),
      igst: toPaise(Number(row.igst)),
      total: toPaise(Number(row.total)),
      reason: row.reason,
    })),

    receipts: sample.receipts.map(
      (row): Receipt => ({
        id: row.id,
        receiptNo: row.receipt_no,
        customerId: row.customer_id,
        receiptDate: row.receipt_date,
        bankAmount: toPaise(Number(row.bank_amount)),
        tdsAmount: toPaise(Number(row.tds_amount)),
        mode: row.mode as Receipt["mode"],
        reference: row.reference,
      })
    ),

    allocations: sample.allocations.map((row) => ({
      id: row.id,
      receiptId: row.receipt_id,
      invoiceId: row.invoice_id,
      allocationDate: row.allocation_date,
      amount: toPaise(Number(row.amount)),
    })),

    notes: sample.notes.map(
      (row): Note => ({
        id: row.id,
        customerId: row.customer_id,
        invoiceId: row.invoice_id,
        noteDate: row.note_date,
        noteType: row.note_type as Note["noteType"],
        body: row.body,
        followUpDate: row.follow_up_date,
        followUpDone: row.follow_up_done,
        promiseDate: row.promise_date,
        promiseAmount:
          row.promise_amount === null ? null : toPaise(Number(row.promise_amount)),
      })
    ),
  };
}

/** Lookups by the business keys used in the brief. */
export function finders(data: ArData) {
  return {
    customer: (code: string) => {
      const c = data.customers.find((x) => x.code === code);
      if (!c) throw new Error(`No customer ${code}`);
      return c;
    },
    invoice: (no: string) => {
      const i = data.invoices.find((x) => x.invoiceNo === no);
      if (!i) throw new Error(`No invoice ${no}`);
      return i;
    },
    receipt: (no: string) => {
      const r = data.receipts.find((x) => x.receiptNo === no);
      if (!r) throw new Error(`No receipt ${no}`);
      return r;
    },
  };
}

/** Every 'YYYY-MM-DD' from `from` to `to`, inclusive. */
export function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  const [y, m, d] = from.split("-").map(Number);
  const cursor = new Date(Date.UTC(y, m - 1, d));
  for (;;) {
    const day = cursor.toISOString().slice(0, 10);
    if (day > to) break;
    days.push(day);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}
