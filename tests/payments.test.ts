import { describe, expect, it } from "vitest";
import type { ArData } from "@/lib/ar/types";
import {
  canDeleteReceipt,
  expectedTds,
  openInvoicesForPayment,
  receiptAvailable,
  suggestAllocation,
  unappliedAfter,
  validateAllocations,
} from "@/lib/ar/payments";
import { finders, makeData, toPaise } from "./helpers";

const data = makeData();
const find = finders(data);

/** The sample data as it was just before a receipt was recorded. */
function withoutReceipt(receiptNo: string): ArData {
  const r = find.receipt(receiptNo);
  return {
    ...data,
    receipts: data.receipts.filter((x) => x.id !== r.id),
    allocations: data.allocations.filter((a) => a.receiptId !== r.id),
  };
}

describe("Open invoices for a payment", () => {
  it("lists only the customer's live, unpaid invoices dated on or before the payment", () => {
    const c007 = find.customer("C007");
    // As things stood before 0015 was paid on 08-Sep.
    const open = openInvoicesForPayment(withoutReceipt("RCT/26-27/0015"), c007.id, "2026-08-31");
    const nos = open.map((r) => r.invoice.invoiceNo);
    expect(nos).not.toContain("BWA/26-27/0014"); // cancelled
    expect(nos).not.toContain("BWA/26-27/0002"); // paid
    expect(nos).toEqual(["BWA/26-27/0015", "BWA/26-27/0023"]);
  });

  it("treats every allocation and credit note as used, whatever its date", () => {
    // 0015 is paid on 08-Sep; an allocation dated 31-Aug must not be offered
    // more than what is still free, or R6 would be broken later.
    const c007 = find.customer("C007");
    const open = openInvoicesForPayment(data, c007.id, "2026-09-30").map((r) => r.invoice.invoiceNo);
    expect(open).toEqual(["BWA/26-27/0023"]);

    const c004 = find.customer("C004");
    const inv7 = openInvoicesForPayment(data, c004.id, "2026-08-31").find(
      (r) => r.invoice.invoiceNo === "BWA/26-27/0007"
    )!;
    expect(inv7.open).toBe(toPaise(3000)); // 2,95,000 − 29,500 CN − 2,62,500 paid
  });

  it("sorts oldest first: due date, then invoice number", () => {
    const c001 = find.customer("C001");
    const open = openInvoicesForPayment(withoutReceipt("RCT/26-27/0017"), c001.id, "2026-09-10");
    const dues = open.map((r) => r.invoice.dueDate);
    expect(dues).toEqual([...dues].sort());
    expect(open[0].invoice.invoiceNo).toBe("BWA/26-27/0021");
  });
});

describe("TDS pre-fill (R5)", () => {
  it("C001 RCT/26-27/0003: ₹81,000 by bank pre-fills ₹7,500 TDS", () => {
    const before = withoutReceipt("RCT/26-27/0003");
    const c001 = find.customer("C001");
    const open = openInvoicesForPayment(before, c001.id, "2026-05-03");
    expect(expectedTds(open, toPaise(81000), c001.tdsRatePct)).toBe(toPaise(7500));
  });

  it("C007 RCT/26-27/0009: ₹5,72,400 across two invoices pre-fills ₹53,000", () => {
    const before = withoutReceipt("RCT/26-27/0009");
    const c007 = find.customer("C007");
    const open = openInvoicesForPayment(before, c007.id, "2026-06-25");
    expect(expectedTds(open, toPaise(572400), c007.tdsRatePct)).toBe(toPaise(53000));
  });

  it("uses the taxable value net of credit notes", () => {
    // 0007: taxable 2,50,000 less CN 25,000 = 2,25,000 → TDS 22,500 (as deducted).
    const before = withoutReceipt("RCT/26-27/0013");
    const c004 = find.customer("C004");
    const open = openInvoicesForPayment(before, c004.id, "2026-08-14").filter(
      (r) => r.invoice.invoiceNo === "BWA/26-27/0007"
    );
    expect(expectedTds(open, toPaise(243000), c004.tdsRatePct)).toBe(toPaise(22500));
  });

  it("is zero for a 0% customer, and no TDS is assumed on an advance", () => {
    const c006 = find.customer("C006");
    expect(expectedTds(openInvoicesForPayment(data, c006.id, "2026-08-31"), toPaise(10000), c006.tdsRatePct)).toBe(0);
    expect(expectedTds([], toPaise(90000), 10)).toBe(0);
  });
});

describe("Oldest-first suggestion (R6)", () => {
  it("fills the oldest invoice first and leaves the rest unapplied", () => {
    const before = withoutReceipt("RCT/26-27/0009");
    const c007 = find.customer("C007");
    const open = openInvoicesForPayment(before, c007.id, "2026-06-25");
    const lines = suggestAllocation(open, toPaise(572400 + 53000));
    expect(lines).toEqual([
      { invoiceId: find.invoice("BWA/26-27/0002").id, amount: toPaise(413000) },
      { invoiceId: find.invoice("BWA/26-27/0008").id, amount: toPaise(212400) },
    ]);
    expect(unappliedAfter(toPaise(572400), toPaise(53000), lines)).toBe(0);
  });

  it("part-pays the next invoice when the money runs out", () => {
    const c002 = find.customer("C002");
    const open = openInvoicesForPayment(data, c002.id, "2026-08-31");
    const lines = suggestAllocation(open, toPaise(50000));
    expect(lines).toHaveLength(1);
    expect(lines[0].amount).toBe(toPaise(50000));
  });

  it("an advance with no open invoices stays fully unapplied", () => {
    const lines = suggestAllocation([], toPaise(100000));
    expect(lines).toEqual([]);
    expect(unappliedAfter(toPaise(90000), toPaise(10000), lines)).toBe(toPaise(100000));
  });
});

describe("Allocation validation (R6)", () => {
  const c002 = find.customer("C002");
  const inv3 = find.invoice("BWA/26-27/0003"); // 69,600 open
  const base = {
    customerId: c002.id,
    receiptDate: "2026-08-31",
    allocationDate: "2026-08-31",
    available: toPaise(100000),
  };

  it("accepts a valid allocation", () => {
    expect(validateAllocations(data, { ...base, lines: [{ invoiceId: inv3.id, amount: toPaise(69600) }] })).toEqual([]);
  });

  it("rejects more than the invoice has open", () => {
    const errors = validateAllocations(data, { ...base, lines: [{ invoiceId: inv3.id, amount: toPaise(69600.01) }] });
    expect(errors.join()).toMatch(/only ₹69,600.00 left/);
  });

  it("rejects more than the receipt has available", () => {
    const errors = validateAllocations(data, {
      ...base,
      available: toPaise(1000),
      lines: [{ invoiceId: inv3.id, amount: toPaise(2000) }],
    });
    expect(errors.join()).toMatch(/more than the ₹1,000.00 available/);
  });

  it("rejects another customer's invoice and a cancelled invoice", () => {
    const other = find.invoice("BWA/26-27/0015");
    const cancelled = find.invoice("BWA/26-27/0014");
    expect(validateAllocations(data, { ...base, lines: [{ invoiceId: other.id, amount: 100 }] }).join()).toMatch(/different customer/);
    const c007 = find.customer("C007");
    expect(
      validateAllocations(data, { ...base, customerId: c007.id, lines: [{ invoiceId: cancelled.id, amount: 100 }] }).join()
    ).toMatch(/cancelled/);
  });

  it("rejects an allocation dated before the receipt or the invoice", () => {
    expect(
      validateAllocations(data, { ...base, allocationDate: "2026-08-30", lines: [] }).join()
    ).toMatch(/earlier than the receipt date/);
    const inv18 = find.invoice("BWA/26-27/0018"); // dated 20-Jul
    expect(
      validateAllocations(data, {
        ...base,
        receiptDate: "2026-07-01",
        allocationDate: "2026-07-01",
        lines: [{ invoiceId: inv18.id, amount: 100 }],
      }).join()
    ).toMatch(/dated after the allocation date/);
  });

  it("rejects duplicates and negative amounts, ignores zero lines", () => {
    expect(
      validateAllocations(data, { ...base, lines: [{ invoiceId: inv3.id, amount: 100 }, { invoiceId: inv3.id, amount: 100 }] }).join()
    ).toMatch(/more than once/);
    expect(validateAllocations(data, { ...base, lines: [{ invoiceId: inv3.id, amount: -1 }] })).toHaveLength(1);
    expect(validateAllocations(data, { ...base, lines: [{ invoiceId: inv3.id, amount: 0 }] })).toEqual([]);
  });
});

describe("Corrections", () => {
  it("a receipt with allocations cannot be deleted", () => {
    const result = canDeleteReceipt(data, find.receipt("RCT/26-27/0009").id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/2 allocations/);
  });

  it("a receipt with no allocations can be deleted", () => {
    const r = find.receipt("RCT/26-27/0009");
    const freed = { ...data, allocations: data.allocations.filter((a) => a.receiptId !== r.id) };
    expect(canDeleteReceipt(freed, r.id)).toEqual({ ok: true });
  });

  it("removing an allocation frees it on the receipt", () => {
    const r = find.receipt("RCT/26-27/0013");
    expect(receiptAvailable(data, r.id)).toBe(0);
    const freed = { ...data, allocations: data.allocations.filter((a) => a.receiptId !== r.id) };
    expect(receiptAvailable(freed, r.id)).toBe(toPaise(262500));
  });

  it("counts allocations of any date against the receipt (C005 advance allocated 05-Sep)", () => {
    const r = find.receipt("RCT/26-27/0011");
    expect(receiptAvailable(data, r.id)).toBe(0); // the fixture holds the 05-Sep allocation
  });
});
