import { describe, expect, it } from "vitest";
import sample from "./fixtures/sample.json";
import type { ArData } from "@/lib/ar/types";
import {
  bucketFor,
  customerPosition,
  invoicePosition,
} from "@/lib/ar/calculations";

function toPaise(value: number): number {
  return Math.round(value * 100);
}

function makeData(): ArData {
  return {
    customers: sample.customers.map((row: any) => ({
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
    })),

    invoices: sample.invoices.map((row: any) => ({
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
    })),

    creditNotes: sample.credit_notes.map((row: any) => ({
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

    receipts: sample.receipts.map((row: any) => ({
      id: row.id,
      receiptNo: row.receipt_no,
      customerId: row.customer_id,
      receiptDate: row.receipt_date,
      bankAmount: toPaise(Number(row.bank_amount)),
      tdsAmount: toPaise(Number(row.tds_amount)),
      mode: row.mode,
      reference: row.reference,
    })),

    allocations: sample.allocations.map((row: any) => ({
      id: row.id,
      receiptId: row.receipt_id,
      invoiceId: row.invoice_id,
      allocationDate: row.allocation_date,
      amount: toPaise(Number(row.amount)),
    })),

    notes: sample.notes.map((row: any) => ({
      id: row.id,
      customerId: row.customer_id,
      invoiceId: row.invoice_id,
      noteDate: row.note_date,
      noteType: row.note_type,
      body: row.body,
      followUpDate: row.follow_up_date,
      followUpDone: row.follow_up_done,
      promiseDate: row.promise_date,
      promiseAmount:
        row.promise_amount === null
          ? null
          : toPaise(Number(row.promise_amount)),
    })),
  };
}

const data = makeData();

describe("Ageing buckets", () => {
  it("puts due invoices in Not due", () => {
    expect(bucketFor(0)).toBe("Not due");
  });

  it("puts 30 days in 1-30", () => {
    expect(bucketFor(30)).toBe("1-30");
  });

  it("puts 31 days in 31-60", () => {
    expect(bucketFor(31)).toBe("31-60");
  });

  it("puts 90 days in 61-90", () => {
    expect(bucketFor(90)).toBe("61-90");
  });

  it("puts 91 days in 91-180", () => {
    expect(bucketFor(91)).toBe("91-180");
  });

  it("puts 181 days in Over 180", () => {
    expect(bucketFor(181)).toBe("Over 180");
  });
});

describe("Invoice positions", () => {
  it("calculates BWA/26-27/0003 correctly at 31-Aug-2026", () => {
    const invoice = data.invoices.find(
      (item) => item.invoiceNo === "BWA/26-27/0003"
    );

    expect(invoice).toBeDefined();

    const position = invoicePosition(
      data,
      invoice!,
      "2026-08-31"
    );

    expect(position).not.toBeNull();
    expect(position!.outstanding).toBe(
      toPaise(69600)
    );
    expect(position!.status).toBe("Overdue");
    expect(position!.isPartPaid).toBe(true);
    expect(position!.daysPastDue).toBe(90);
    expect(position!.bucket).toBe("61-90");
  });

  it("marks BWA/26-27/0021 as due on 31-Aug-2026", () => {
    const invoice = data.invoices.find(
      (item) => item.invoiceNo === "BWA/26-27/0021"
    );

    const position = invoicePosition(
      data,
      invoice!,
      "2026-08-31"
    );

    expect(position!.outstanding).toBe(
      toPaise(88500)
    );
    expect(position!.status).toBe("Due");
  });

  it("marks BWA/26-27/0021 overdue on 06-Sep-2026", () => {
    const invoice = data.invoices.find(
      (item) => item.invoiceNo === "BWA/26-27/0021"
    );

    const position = invoicePosition(
      data,
      invoice!,
      "2026-09-06"
    );

    expect(position!.outstanding).toBe(
      toPaise(88500)
    );
    expect(position!.status).toBe("Overdue");
    expect(position!.daysPastDue).toBe(2);
  });

  it("marks BWA/26-27/0021 paid on 15-Sep-2026", () => {
    const invoice = data.invoices.find(
      (item) => item.invoiceNo === "BWA/26-27/0021"
    );

    const position = invoicePosition(
      data,
      invoice!,
      "2026-09-15"
    );

    expect(position!.outstanding).toBe(0);
    expect(position!.status).toBe("Paid");
  });

  it("calculates BWA/26-27/0007 with credit note and TDS payment", () => {
    const invoice = data.invoices.find(
      (item) => item.invoiceNo === "BWA/26-27/0007"
    );

    const position = invoicePosition(
      data,
      invoice!,
      "2026-08-31"
    );

    expect(position!.outstanding).toBe(
      toPaise(3000)
    );
    expect(position!.credited).toBe(
      toPaise(29500)
    );
    expect(position!.received).toBe(
      toPaise(240000 + 22500)
    );
  });
});

describe("Customer positions", () => {
  it("calculates C005 correctly at 31-Aug-2026", () => {
    const customer = data.customers.find(
      (item) => item.code === "C005"
    );

    expect(customer).toBeDefined();

    const position = customerPosition(
      data,
      customer!.id,
      "2026-08-31"
    );

    expect(position.outstanding).toBe(
      toPaise(188800)
    );

    expect(position.unappliedCredit).toBe(
      toPaise(100000)
    );

    expect(position.netBalance).toBe(
      toPaise(88800)
    );
  });

  it("shows C005 as a 100000 credit on 12-Jul-2026", () => {
    const customer = data.customers.find(
      (item) => item.code === "C005"
    );

    const position = customerPosition(
      data,
      customer!.id,
      "2026-07-12"
    );

    expect(position.outstanding).toBe(0);
    expect(position.unappliedCredit).toBe(
      toPaise(100000)
    );
    expect(position.netBalance).toBe(
      toPaise(-100000)
    );
  });
});