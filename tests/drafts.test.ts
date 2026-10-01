import { describe, expect, it } from "vitest";
import { formatDrCr, plainAmount } from "@/lib/ar/format";
import { toCsv } from "@/lib/csv";
import { statementPeriod } from "@/lib/ar/statement-params";
import { draftCreditNote, draftInvoice, isDuplicateNumberError } from "@/lib/ar/drafts";
import { gstSplitByMode } from "@/lib/ar/documents";
import { finders, makeData, toPaise } from "./helpers";

const data = makeData();
const find = finders(data);

describe("R18 Dr / Cr", () => {
  it("suffix follows the sign", () => {
    expect(formatDrCr(toPaise(223000))).toBe("₹2,23,000.00 Dr");
    expect(formatDrCr(toPaise(-100000))).toBe("₹1,00,000.00 Cr");
    expect(formatDrCr(0)).toBe("₹0.00");
  });

  it("CSV amounts are plain numbers", () => {
    expect(plainAmount(toPaise(70800))).toBe("70800.00");
    expect(plainAmount(5)).toBe("0.05");
    expect(plainAmount(-12345)).toBe("-123.45");
  });
});

describe("CSV", () => {
  it("starts with a BOM, quotes only fields that need it, doubles inner quotes", () => {
    const csv = toCsv([["a", "Cost audit support, Q3", 'He said "hi"', 5, null]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe('a,"Cost audit support, Q3","He said ""hi""",5,\r\n');
  });
});

describe("Statement period", () => {
  it("defaults to 1 April of the as-at date's financial year, to the as-at date", () => {
    expect(statementPeriod("2026-08-31")).toEqual({ from: "2026-04-01", to: "2026-08-31", error: null });
    expect(statementPeriod("2027-02-10")).toEqual({ from: "2026-04-01", to: "2027-02-10", error: null });
  });

  it("rejects From after To", () => {
    expect(statementPeriod("2026-08-31", "2026-09-01", "2026-08-01").error).toMatch(/after/);
  });
});

describe("Invoice draft (what the preview shows and the save writes)", () => {
  it("next C001 invoice: number, due date, split, total", () => {
    const c001 = find.customer("C001");
    const d = draftInvoice(data, {
      customerId: c001.id,
      invoiceDate: "2026-10-05",
      taxable: toPaise(75000),
      gstRatePct: 18,
    });
    expect(d.errors).toEqual([]);
    expect(d.invoiceNo).toBe("BWA/26-27/0025");
    expect(d.dueDate).toBe("2026-11-04"); // 30 days in the sample data
    expect(d.intraState).toBe(true);
    expect(d.gst).toEqual({ cgst: toPaise(6750), sgst: toPaise(6750), igst: 0 });
    expect(d.total).toBe(toPaise(88500));
  });

  it("Tamhini at 45 days: a new invoice is due 45 days later", () => {
    const c001 = find.customer("C001");
    const changed = {
      ...data,
      customers: data.customers.map((c) => (c.id === c001.id ? { ...c, creditDays: 45 } : c)),
    };
    const d = draftInvoice(changed, { customerId: c001.id, invoiceDate: "2026-10-05", taxable: 100, gstRatePct: 18 });
    expect(d.dueDate).toBe("2026-11-19");
  });

  it("₹1,000.05 for a Maharashtra customer → CGST ₹90.00 + SGST ₹90.00 (the saved figures)", () => {
    const d = draftInvoice(data, {
      customerId: find.customer("C001").id,
      invoiceDate: "2026-10-05",
      taxable: toPaise(1000.05),
      gstRatePct: 18,
    });
    expect(d.gst).toEqual({ cgst: 9000, sgst: 9000, igst: 0 });
    expect(d.total).toBe(toPaise(1180.05));
  });

  it("refuses an inactive customer", () => {
    const c008 = find.customer("C008");
    const d = draftInvoice(data, { customerId: c008.id, invoiceDate: "2026-10-05", taxable: 100, gstRatePct: 18 });
    expect(d.errors.join()).toMatch(/inactive/);
  });

  it("carries the credit-limit warning without making it an error (R9)", () => {
    const c003 = find.customer("C003");
    const d = draftInvoice(data, { customerId: c003.id, invoiceDate: "2026-08-31", taxable: 100, gstRatePct: 18 });
    expect(d.creditLimit?.exceedsLimit).toBe(true);
    expect(d.errors).toEqual([]);
  });
});

describe("Credit note draft (R7)", () => {
  it("uses the invoice's split and rate, and the next CN number", () => {
    const inv = find.invoice("BWA/26-27/0002"); // IGST invoice, fully paid
    const d = draftCreditNote(data, { invoiceId: inv.id, creditNoteDate: "2026-09-01", taxable: toPaise(100) });
    expect(d.gst).toEqual({ cgst: 0, sgst: 0, igst: toPaise(18) });
    expect(d.creditNoteNo).toBe("BWA/CN/26-27/002");
    expect(d.errors.join()).toMatch(/only ₹0.00/); // nothing left open to credit
  });

  it("cannot exceed what is still open", () => {
    const inv = find.invoice("BWA/26-27/0007"); // ₹3,000 open, CGST + SGST
    const ok = draftCreditNote(data, { invoiceId: inv.id, creditNoteDate: "2026-09-01", taxable: toPaise(2542.37) });
    expect(ok.total).toBe(toPaise(2999.99));
    expect(ok.errors).toEqual([]);
    const exact = draftCreditNote(data, { invoiceId: inv.id, creditNoteDate: "2026-09-01", taxable: toPaise(2542.38) });
    expect(exact.total).toBe(toPaise(3000)); // exactly the open amount is allowed
    expect(exact.errors).toEqual([]);
    const tooBig = draftCreditNote(data, { invoiceId: inv.id, creditNoteDate: "2026-09-01", taxable: toPaise(2542.39) }); // 3,000.03
    expect(tooBig.errors).toHaveLength(1);
  });

  it("matches the sample credit note BWA/CN/26-27/001 exactly", () => {
    const cn = data.creditNotes[0];
    const inv = data.invoices.find((i) => i.id === cn.invoiceId)!;
    const gst = gstSplitByMode(inv.igst === 0, cn.taxableValue, inv.gstRatePct);
    expect(gst).toEqual({ cgst: cn.cgst, sgst: cn.sgst, igst: cn.igst });
  });

  it("refuses a cancelled invoice", () => {
    const inv = find.invoice("BWA/26-27/0014");
    expect(
      draftCreditNote(data, { invoiceId: inv.id, creditNoteDate: "2026-09-01", taxable: 100 }).errors.join()
    ).toMatch(/cancelled/);
  });
});

describe("Duplicate-number detection (retry once, README 4.8)", () => {
  it("recognises Postgres unique violations only", () => {
    expect(isDuplicateNumberError('duplicate key value violates unique constraint "invoices_no_key"')).toBe(true);
    expect(isDuplicateNumberError("Invoice BWA/26-27/0007 has only 3000.00 outstanding.")).toBe(false);
  });
});
