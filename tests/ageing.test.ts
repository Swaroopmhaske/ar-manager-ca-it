import { describe, expect, it } from "vitest";
import {
  AGEING_BUCKETS,
  bucketFor,
  customerPosition,
  invoicePosition,
  statement,
  sumAgeing,
} from "@/lib/ar/calculations";
import { dashboardSummary } from "@/lib/ar/attention";
import { eachDay, finders, makeData } from "./helpers";

const data = makeData();
const find = finders(data);

describe("Client change: new ageing bands", () => {
  it.each([
    [-5, "Not due"],
    [0, "Not due"],
    [1, "1-15"],
    [15, "1-15"],
    [16, "16-30"],
    [30, "16-30"],
    [31, "31-45"],
    [45, "31-45"],
    [46, "46-90"],
    [90, "46-90"],
    [91, "Over 90"],
    [400, "Over 90"],
  ])("%i days past due → %s", (days, bucket) => {
    expect(bucketFor(days)).toBe(bucket);
  });

  it("has exactly the six client bands, in order", () => {
    expect([...AGEING_BUCKETS]).toEqual([
      "Not due",
      "1-15",
      "16-30",
      "31-45",
      "46-90",
      "Over 90",
    ]);
  });

  it("uses days past due from the DUE date, not the invoice date", () => {
    // BWA/26-27/0003: invoiced 18-Apr, due 02-Jun (45 days); at 31-Aug it is
    // 90 days past due (46-90), although 135 days after the invoice date.
    const p = invoicePosition(data, find.invoice("BWA/26-27/0003"), "2026-08-31")!;
    expect(p.daysPastDue).toBe(90);
    expect(p.bucket).toBe("46-90");
  });

  it("does not age paid invoices", () => {
    const p = invoicePosition(data, find.invoice("BWA/26-27/0001"), "2026-08-31")!;
    expect(p.outstanding).toBe(0);
    expect(p.bucket).toBeNull();
  });

  it("ageing buckets always add up to the outstanding, for every customer and day", () => {
    for (const asOf of eachDay("2026-01-01", "2026-10-31")) {
      for (const c of data.customers) {
        const p = customerPosition(data, c.id, asOf);
        const sum = AGEING_BUCKETS.reduce((s, b) => s + p.ageing[b], 0);
        expect(sum, `${c.code} ${asOf}`).toBe(p.outstanding);
      }
    }
  });

  it("dashboard ageing totals row equals the sum of the customer rows", () => {
    const asOf = "2026-08-31";
    const summary = dashboardSummary(data, asOf);
    const byHand = sumAgeing(data.customers.map((c) => customerPosition(data, c.id, asOf).ageing));
    expect(summary.ageing).toEqual(byHand);
    const total = AGEING_BUCKETS.reduce((s, b) => s + summary.ageing[b], 0);
    expect(total).toBe(summary.totalOutstanding);
  });

  it("statement footer uses the same bands and adds up to invoice outstanding", () => {
    const c = find.customer("C002");
    const result = statement(data, c.id, "2026-04-01", "2026-08-31");
    expect(Object.keys(result.ageing)).toEqual([...AGEING_BUCKETS]);
    const aged = AGEING_BUCKETS.reduce((s, b) => s + result.ageing[b], 0);
    expect(aged - result.unappliedCredit).toBe(result.closingBalance);
  });
});
