import { describe, expect, it } from "vitest";
import {
  creditLimitCheck,
  dashboardSummary,
  needsAttention,
  overdueInvoices,
} from "@/lib/ar/attention";
import { creditLimitUsedPct, customerPosition, invoicePosition } from "@/lib/ar/calculations";
import { customerListRows } from "@/lib/ar/lists";
import { documentTotal, dueDate, gstSplit } from "@/lib/ar/documents";
import { finders, makeData, toPaise } from "./helpers";

const data = makeData();
const find = finders(data);
const codes = (items: { customer: { code: string } }[]) => items.map((i) => i.customer.code);

describe("Needs attention", () => {
  const attention = needsAttention(data, "2026-08-31");

  it("shows Varandha's broken promise as at 31-Aug-2026 (spot check 9)", () => {
    expect(codes(attention.brokenPromises)).toEqual(["C002"]);
    expect(attention.brokenPromises[0].note.promiseAmount).toBe(toPaise(69600));
  });

  it("shows Sabarmati's ₹1,00,000 waiting to be allocated", () => {
    expect(codes(attention.unappliedCredit)).toEqual(["C005"]);
    expect(attention.unappliedCredit[0].position.unappliedCredit).toBe(toPaise(100000));
  });

  it("flags customers over their limit from the real customer position", () => {
    expect(codes(attention.overLimit)).toEqual(["C003"]);
    expect(attention.overLimit[0].position.netBalance).toBe(toPaise(446600));
  });

  it("lists follow-ups once their date arrives, until marked done", () => {
    expect(attention.followUpsDue).toEqual([]); // the first is due 01-Sep
    const later = needsAttention(data, "2026-09-15").followUpsDue;
    expect(later.map((i) => i.note.followUpDate)).toEqual([
      "2026-09-01",
      "2026-09-05",
      "2026-09-10",
      "2026-09-15",
    ]);
    const done = {
      ...data,
      notes: data.notes.map((n) => (n.followUpDate === "2026-09-01" ? { ...n, followUpDone: true } : n)),
    };
    expect(needsAttention(done, "2026-09-15").followUpsDue).toHaveLength(3);
  });

  it("an allocated advance drops off the list (C005 on 05-Sep)", () => {
    expect(codes(needsAttention(data, "2026-09-05").unappliedCredit)).toEqual([]);
  });
});

describe("Dashboard summary", () => {
  const s = dashboardSummary(data, "2026-08-31");

  it("net receivable is outstanding less unapplied credit", () => {
    expect(s.unappliedCredit).toBe(toPaise(100000));
    expect(s.netReceivable).toBe(s.totalOutstanding - s.unappliedCredit);
  });

  it("overdue equals outstanding less the Not due bucket", () => {
    expect(s.overdue).toBe(s.totalOutstanding - s.ageing["Not due"]);
  });

  it("counts and orders overdue invoices longest-late first", () => {
    const list = overdueInvoices(data, "2026-08-31");
    expect(s.overdueInvoiceCount).toBe(list.length);
    const days = list.map((p) => p.daysPastDue);
    expect(days).toEqual([...days].sort((a, b) => b - a));
    expect(list.every((p) => p.status === "Overdue")).toBe(true);
  });
});

describe("Credit-limit warning (R9)", () => {
  const c001 = find.customer("C001"); // limit ₹5,00,000, net ₹88,500 at 31-Aug
  const date = "2026-08-31";

  it("below the limit: no warning", () => {
    const check = creditLimitCheck(data, c001.id, date, toPaise(100000));
    expect(check.currentNetBalance).toBe(toPaise(88500));
    expect(check.projectedNetBalance).toBe(toPaise(188500));
    expect(check.exceedsLimit).toBe(false);
  });

  it("exactly at the limit: no warning (only ABOVE the limit warns, as R13)", () => {
    const check = creditLimitCheck(data, c001.id, date, toPaise(500000 - 88500));
    expect(check.projectedNetBalance).toBe(c001.creditLimit);
    expect(check.exceedsLimit).toBe(false);
  });

  it("one paisa above the limit: warns", () => {
    const check = creditLimitCheck(data, c001.id, date, toPaise(500000 - 88500) + 1);
    expect(check.exceedsLimit).toBe(true);
  });

  it("counts unapplied credit: Sabarmati's advance makes room", () => {
    const c005 = find.customer("C005"); // limit ₹2,50,000
    // 12-Jul: no invoices, ₹1,00,000 advance → net −1,00,000 (Cr).
    // A ₹3,40,000 invoice lands at ₹2,40,000: inside the limit.
    const inside = creditLimitCheck(data, c005.id, "2026-07-12", toPaise(340000));
    expect(inside.currentNetBalance).toBe(toPaise(-100000));
    expect(inside.projectedNetBalance).toBe(toPaise(240000));
    expect(inside.exceedsLimit).toBe(false);
    // Without the advance the same invoice would breach it.
    const gross = customerPosition(data, c005.id, "2026-07-12").outstanding + toPaise(340000);
    expect(gross > c005.creditLimit).toBe(true);
  });

  it("an already over-limit customer warns on any new invoice", () => {
    const c003 = find.customer("C003");
    expect(creditLimitCheck(data, c003.id, date, 1).exceedsLimit).toBe(true);
  });

  it("is information only: it returns figures, never throws or blocks", () => {
    const check = creditLimitCheck(data, find.customer("C003").id, date, toPaise(1000000));
    expect(Object.keys(check).sort()).toEqual(
      ["creditLimit", "currentNetBalance", "exceedsLimit", "newInvoiceTotal", "projectedNetBalance"].sort()
    );
  });
});

describe("Limit used (design decision: net balance)", () => {
  const rows = customerListRows(data, "2026-08-31");
  const pct = (code: string) => rows.find((r) => r.customer.code === code)!.limitUsedPct;

  it("Sabarmati shows 36%, not 76%: the ₹1,00,000 advance reduces exposure", () => {
    // gross ₹1,88,800 would be 76%; net ₹88,800 / ₹2,50,000 = 35.52% → 36%
    expect(pct("C005")).toBe(36);
  });

  it("agrees with the over-limit flag: over 100% exactly when over limit", () => {
    for (const r of rows) {
      if (r.position.overLimit) expect(r.limitUsedPct).toBeGreaterThan(100);
    }
    expect(pct("C003")).toBe(112); // 4,46,600 / 4,00,000
  });

  it("a credit (Cr) balance uses none of the limit", () => {
    const c005 = find.customer("C005");
    const p = customerPosition(data, c005.id, "2026-07-12");
    expect(p.netBalance).toBeLessThan(0);
    expect(creditLimitUsedPct(p, c005.creditLimit)).toBe(0);
  });
});

describe("GST rounding (R3)", () => {
  it("₹1,000.05 taxable at 18% in Maharashtra → CGST ₹90.00 + SGST ₹90.00", () => {
    // 1,000.05 × 9% = 90.0045 → 90.00 each. Halving 18% first (180.009 → 180.01)
    // would wrongly give 90.01 + 90.00.
    const gst = gstSplit("Maharashtra", toPaise(1000.05), 18);
    expect(gst).toEqual({ cgst: 9000, sgst: 9000, igst: 0 });
    expect(documentTotal(toPaise(1000.05), gst)).toBe(toPaise(1180.05));
  });

  it("₹1,000.05 outside Maharashtra → IGST ₹180.01", () => {
    expect(gstSplit("Karnataka", toPaise(1000.05), 18)).toEqual({ cgst: 0, sgst: 0, igst: 18001 });
  });

  it("CGST always equals SGST", () => {
    for (let taxable = 1; taxable <= 5000; taxable++) {
      const { cgst, sgst } = gstSplit("Maharashtra", taxable, 18);
      expect(cgst).toBe(sgst);
    }
  });
});

describe("Client change: Tamhini Foods (C001) terms 30 → 45 days", () => {
  const before = find.customer("C001");
  const changed = {
    ...data,
    customers: data.customers.map((c) => (c.id === before.id ? { ...c, creditDays: 45 } : c)),
  };

  it("was on 30 days in the sample data", () => {
    expect(before.creditDays).toBe(30);
  });

  it("existing invoices keep their stored due dates (R2)", () => {
    for (const inv of changed.invoices.filter((i) => i.customerId === before.id)) {
      const original = data.invoices.find((i) => i.id === inv.id)!;
      expect(inv.dueDate).toBe(original.dueDate);
      expect(inv.dueDate).toBe(dueDate(inv.invoiceDate, 30));
    }
    // Spot check 1 still holds: BWA/26-27/0001 due 05-May-2026.
    expect(find.invoice("BWA/26-27/0001").dueDate).toBe("2026-05-05");
  });

  it("existing invoice positions do not move", () => {
    for (const asOf of ["2026-08-31", "2026-09-06", "2026-09-15"]) {
      const inv = find.invoice("BWA/26-27/0021");
      expect(invoicePosition(changed, inv, asOf)).toEqual(invoicePosition(data, inv, asOf));
    }
  });

  it("a new invoice uses 45 days", () => {
    const terms = changed.customers.find((c) => c.id === before.id)!.creditDays;
    expect(dueDate("2026-10-05", terms)).toBe("2026-11-19");
  });
});
