import { describe, expect, it } from "vitest";
import sample from "./fixtures/sample.json";
import type { CreditNote, Invoice, Receipt } from "@/lib/ar/types";
import {
  documentTotal,
  dueDate,
  fyLabel,
  gstSplit,
  nextNumber,
} from "@/lib/ar/documents";

const paise = (rupees: number) => Math.round(rupees * 100);

const customerById = new Map(sample.customers.map((c) => [c.id, c]));

// Only the document-number fields matter for nextNumber.
const numbers = {
  invoices: sample.invoices.map((r) => ({ invoiceNo: r.invoice_no }) as Invoice),
  creditNotes: sample.credit_notes.map(
    (r) => ({ creditNoteNo: r.credit_note_no }) as CreditNote
  ),
  receipts: sample.receipts.map((r) => ({ receiptNo: r.receipt_no }) as Receipt),
};

describe("R2 dueDate", () => {
  it("adds calendar days", () => {
    expect(dueDate("2026-04-05", 30)).toBe("2026-05-05");
  });

  it("crosses month and year ends", () => {
    expect(dueDate("2026-01-20", 30)).toBe("2026-02-19");
    expect(dueDate("2026-12-20", 15)).toBe("2027-01-04");
  });

  it("handles leap years", () => {
    expect(dueDate("2028-02-15", 15)).toBe("2028-03-01");
  });

  it("matches the stored due date of every sample invoice", () => {
    for (const inv of sample.invoices) {
      const customer = customerById.get(inv.customer_id)!;
      expect(dueDate(inv.invoice_date, customer.credit_days), inv.invoice_no).toBe(
        inv.due_date
      );
    }
  });
});

describe("R3 gstSplit", () => {
  it("spot check 1: BWA/26-27/0001 (C001, Maharashtra)", () => {
    const gst = gstSplit("Maharashtra", paise(75000), 18);
    expect(gst).toEqual({ cgst: paise(6750), sgst: paise(6750), igst: 0 });
    expect(documentTotal(paise(75000), gst)).toBe(paise(88500));
  });

  it("spot check 2: BWA/26-27/0002 (C007, Telangana)", () => {
    const gst = gstSplit("Telangana", paise(350000), 18);
    expect(gst).toEqual({ cgst: 0, sgst: 0, igst: paise(63000) });
    expect(documentTotal(paise(350000), gst)).toBe(paise(413000));
  });

  it("rounds each component separately, halves up", () => {
    // 0.25 x 9% = 0.0225 -> 0.02 each; 0.25 x 18% = 0.045 -> 0.05 IGST
    expect(gstSplit("Maharashtra", 25, 18)).toEqual({ cgst: 2, sgst: 2, igst: 0 });
    expect(gstSplit("Gujarat", 25, 18)).toEqual({ cgst: 0, sgst: 0, igst: 5 });
    // 0.50 x 9% = 0.045 -> 0.05 (half rounds up)
    expect(gstSplit("Maharashtra", 50, 18)).toEqual({ cgst: 5, sgst: 5, igst: 0 });
  });

  it("matches the stored GST and total of every sample invoice", () => {
    for (const inv of sample.invoices) {
      const customer = customerById.get(inv.customer_id)!;
      const gst = gstSplit(customer.state, paise(inv.taxable_value), inv.gst_rate_pct);
      expect(gst, inv.invoice_no).toEqual({
        cgst: paise(inv.cgst),
        sgst: paise(inv.sgst),
        igst: paise(inv.igst),
      });
      expect(documentTotal(paise(inv.taxable_value), gst)).toBe(paise(inv.total));
    }
  });
});

describe("R4 fyLabel", () => {
  it("April starts a new financial year", () => {
    expect(fyLabel("2026-03-31")).toBe("25-26");
    expect(fyLabel("2026-04-01")).toBe("26-27");
    expect(fyLabel("2027-03-31")).toBe("26-27");
    expect(fyLabel("2027-04-01")).toBe("27-28");
  });

  it("pads the century turn", () => {
    expect(fyLabel("2099-05-01")).toBe("99-00");
  });
});

describe("R4 nextNumber", () => {
  it("gives the README's next numbers after the sample data", () => {
    expect(nextNumber("invoice", numbers, "2026-10-01")).toBe("BWA/26-27/0025");
    expect(nextNumber("creditNote", numbers, "2026-10-01")).toBe("BWA/CN/26-27/002");
    expect(nextNumber("receipt", numbers, "2026-10-01")).toBe("RCT/26-27/0018");
  });

  it("restarts at 1 in a new financial year", () => {
    expect(nextNumber("invoice", numbers, "2027-04-01")).toBe("BWA/27-28/0001");
    expect(nextNumber("creditNote", numbers, "2027-04-01")).toBe("BWA/CN/27-28/001");
    expect(nextNumber("receipt", numbers, "2027-04-01")).toBe("RCT/27-28/0001");
  });

  it("continues the carried-over FY 25-26 series", () => {
    expect(nextNumber("invoice", numbers, "2026-03-31")).toBe("BWA/25-26/0172");
  });

  it("never reuses a cancelled invoice's number", () => {
    // BWA/26-27/0014 is cancelled but still counts.
    const onlyUpTo14 = {
      ...numbers,
      invoices: numbers.invoices.filter((i) => i.invoiceNo <= "BWA/26-27/0014"),
    };
    expect(nextNumber("invoice", onlyUpTo14, "2026-10-01")).toBe("BWA/26-27/0015");
  });

  it("keeps invoice numbers within 16 characters (GST Rule 46)", () => {
    expect(nextNumber("invoice", numbers, "2026-10-01").length).toBeLessThanOrEqual(16);
  });
});