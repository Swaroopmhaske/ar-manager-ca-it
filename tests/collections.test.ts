import { describe, expect, it } from "vitest";
import {
  attentionFor,
  collectionItems,
  collectionKpis,
  creditStatus,
  customer360,
  customerCreditRows,
  filterWorklist,
  sortWorklist,
  worklistCsvRows,
  worklistFilterFromParams,
  WORKLIST_CSV_HEADER,
  type AttentionInput,
} from "@/lib/ar/collections";
import { dso } from "@/lib/ar/calculations";
import { dashboardSummary } from "@/lib/ar/attention";
import { finders, makeData, toPaise } from "./helpers";

const data = makeData();
const find = finders(data);
const nos = (items: { position: { invoice: { invoiceNo: string } } }[]) => items.map((i) => i.position.invoice.invoiceNo);

describe("Credit status boundaries (workflow indicator)", () => {
  const limit = toPaise(1000);
  it.each([
    [toPaise(-500), "Within Limit"],
    [0, "Within Limit"],
    [toPaise(799.99), "Within Limit"],
    [toPaise(800), "Near Limit"],
    [toPaise(1000), "Near Limit"], // exactly at the limit is not over (R13)
    [toPaise(1000) + 1, "Over Limit"],
  ])("net %i paise on a ₹1,000 limit → %s", (net, status) => {
    expect(creditStatus(net, limit)).toBe(status);
  });

  it("a zero limit: any debit balance is over, nothing owed is within", () => {
    expect(creditStatus(1, 0)).toBe("Over Limit");
    expect(creditStatus(0, 0)).toBe("Within Limit");
  });
});

describe("Attention classification", () => {
  const base: AttentionInput = {
    status: "Overdue",
    daysPastDue: 10,
    isPartPaid: false,
    isDisputed: false,
    promiseStatus: null,
    followUpDue: false,
    customerCreditStatus: "Within Limit",
    customerUnapplied: 0,
  };
  const level = (o: Partial<AttentionInput>) => attentionFor({ ...base, ...o }).level;

  it.each([
    [1, "Normal"],
    [45, "Normal"],
    [46, "High"],
    [90, "High"],
    [91, "Critical"],
  ])("%i days overdue → %s", (days, expected) => {
    expect(level({ daysPastDue: days })).toBe(expected);
  });

  it("broken promise on an overdue invoice → Critical", () => {
    expect(level({ promiseStatus: "Broken" })).toBe("Critical");
  });

  it("customer over its limit → Critical for its overdue invoices", () => {
    expect(level({ customerCreditStatus: "Over Limit" })).toBe("Critical");
  });

  it("near limit alone does not raise priority", () => {
    expect(level({ customerCreditStatus: "Near Limit" })).toBe("Normal");
  });

  it("follow-up due → High, even when not overdue", () => {
    expect(level({ followUpDue: true })).toBe("High");
    expect(level({ status: "Due", daysPastDue: -5, followUpDue: true })).toBe("High");
  });

  it("disputed: High when overdue, Normal when not", () => {
    expect(level({ isDisputed: true })).toBe("High");
    expect(level({ status: "Due", daysPastDue: 0, isDisputed: true })).toBe("Normal");
  });

  it("not-due invoices: part-paid, pending promise, broken promise or unapplied credit → Normal", () => {
    const due = { status: "Due" as const, daysPastDue: -3 };
    expect(level({ ...due, isPartPaid: true })).toBe("Normal");
    expect(level({ ...due, promiseStatus: "Pending" })).toBe("Normal");
    expect(level({ ...due, promiseStatus: "Broken" })).toBe("Normal");
    expect(level({ ...due, customerUnapplied: 100 })).toBe("Normal");
  });

  it("a not-due invoice with no signal is not on the worklist", () => {
    expect(level({ status: "Due", daysPastDue: 0 })).toBeNull();
    expect(level({ status: "Due", daysPastDue: -10, customerCreditStatus: "Over Limit" })).toBeNull();
  });

  it("a kept promise is not a signal", () => {
    expect(attentionFor({ ...base, status: "Due", daysPastDue: -1, promiseStatus: "Kept" }).level).toBeNull();
  });

  it("lists every reason, most serious first", () => {
    const r = attentionFor({ ...base, daysPastDue: 100, promiseStatus: "Broken", isPartPaid: true, followUpDue: true });
    expect(r.level).toBe("Critical");
    expect(r.reasons).toEqual([
      "100 days overdue (over 90)",
      "Promise to pay broken",
      "Follow-up due",
      "Part-paid",
    ]);
  });
});

describe("Worklist on the sample data", () => {
  const asOf = "2026-08-31";
  const all = collectionItems(data, asOf);
  const work = filterWorklist(all, {});

  it("holds every open invoice dated on or before D, and nothing else", () => {
    expect(all).toHaveLength(16);
    expect(all.every((i) => i.position.outstanding > 0 && !i.position.invoice.isCancelled)).toBe(true);
    expect(nos(all)).not.toContain("BWA/26-27/0024"); // dated 05-Sep
    expect(nos(all)).not.toContain("BWA/26-27/0014"); // cancelled
  });

  it("hides not-due invoices with no signal unless asked for all", () => {
    expect(work).toHaveLength(12); // 11 overdue + 0022, not due but Sabarmati holds unapplied credit
    expect(filterWorklist(all, { includeAll: true })).toHaveLength(16);
  });

  it("Varandha's BWA/26-27/0003 is Critical: broken promise", () => {
    const item = all.find((i) => i.position.invoice.invoiceNo === "BWA/26-27/0003")!;
    expect(item.promise?.status).toBe("Broken");
    expect(item.attention).toBe("Critical");
    expect(item.reasons).toContain("Promise to pay broken");
  });

  it("Kundalika is over limit, so all its overdue invoices are Critical", () => {
    const c003 = all.filter((i) => i.customer.code === "C003");
    expect(c003.map((i) => i.attention)).toEqual(["Critical", "Critical", "Critical", "Critical"]);
    expect(c003.every((i) => i.creditStatus === "Over Limit")).toBe(true);
  });

  it("a customer-level promise applies to all the customer's invoices", () => {
    const c003 = all.filter((i) => i.customer.code === "C003");
    expect(c003.every((i) => i.promise?.status === "Pending")).toBe(true); // promised by 30-Sep
  });

  it("the disputed BWA/26-27/0010 is High", () => {
    expect(all.find((i) => i.position.invoice.invoiceNo === "BWA/26-27/0010")!.attention).toBe("High");
  });

  it("Sabarmati's advance is visible on its invoices", () => {
    const item = all.find((i) => i.position.invoice.invoiceNo === "BWA/26-27/0017")!;
    expect(item.position.outstanding).toBe(toPaise(118000)); // the invoice is NOT netted
    expect(item.customerPosition.unappliedCredit).toBe(toPaise(100000));
    expect(item.reasons).toContain("Customer has unapplied credit to allocate");
  });

  it("filters by ageing band", () => {
    expect(nos(filterWorklist(all, { bucket: "46-90" })).sort()).toEqual([
      "BWA/26-27/0003",
      "BWA/26-27/0007",
      "BWA/26-27/0009",
    ]);
    expect(filterWorklist(all, { bucket: "Not due" })).toHaveLength(1); // 0022: Sabarmati's advance
    expect(filterWorklist(all, { bucket: "Not due", includeAll: true })).toHaveLength(5);
  });

  it("filters overdue / due", () => {
    const overdue = filterWorklist(all, { status: "Overdue" });
    expect(overdue).toHaveLength(11);
    expect(overdue.every((i) => i.position.daysPastDue >= 1)).toBe(true);
  });

  it("filters broken promises, credit status, disputed and attention", () => {
    expect(nos(filterWorklist(all, { promise: "Broken" }))).toEqual(["BWA/26-27/0003"]);
    expect(filterWorklist(all, { creditStatus: "Near Limit", includeAll: true }).map((i) => i.customer.code)).toEqual(["C007", "C007"]);
    expect(nos(filterWorklist(all, { disputed: "yes" }))).toEqual(["BWA/26-27/0010"]);
    expect(filterWorklist(all, { attention: "Critical" })).toHaveLength(5);
  });

  it("follow-ups: none due at 31-Aug, four applicable invoices' notes by 15-Sep", () => {
    expect(filterWorklist(all, { followUpDue: true })).toEqual([]);
    const later = filterWorklist(collectionItems(data, "2026-09-15"), { followUpDue: true });
    expect(new Set(later.map((i) => i.followUp!.followUpDate))).toEqual(
      new Set(["2026-09-01", "2026-09-05", "2026-09-10", "2026-09-15"])
    );
  });

  it("a follow-up marked done drops off", () => {
    const done = { ...data, notes: data.notes.map((n) => ({ ...n, followUpDone: true })) };
    expect(filterWorklist(collectionItems(done, "2026-09-15"), { followUpDue: true })).toEqual([]);
  });

  it("sorts by priority, by amount and by days", () => {
    const pri = sortWorklist(work);
    expect(pri[0].attention).toBe("Critical");
    expect(pri[0].position.invoice.invoiceNo).toBe("BWA/25-26/0141"); // 193 days
    const amounts = sortWorklist(work, "outstanding").map((i) => i.position.outstanding);
    expect(amounts).toEqual([...amounts].sort((a, b) => b - a));
    const days = sortWorklist(work, "days").map((i) => i.position.daysPastDue);
    expect(days).toEqual([...days].sort((a, b) => b - a));
  });

  it("reads filters from the URL, ignoring unknown values", () => {
    expect(worklistFilterFromParams({ bucket: "46-90", promise: "Broken", credit: "Over Limit", show: "all", followup: "due" })).toMatchObject({
      bucket: "46-90",
      promise: "Broken",
      creditStatus: "Over Limit",
      includeAll: true,
      followUpDue: true,
    });
    expect(worklistFilterFromParams({ bucket: "61-90", attention: "Urgent" })).toMatchObject({ bucket: null, attention: null });
  });
});

describe("As-at date behaviour", () => {
  it("12-Jul: Sabarmati has no invoices, only the advance", () => {
    const items = collectionItems(data, "2026-07-12").filter((i) => i.customer.code === "C005");
    expect(items).toEqual([]);
    const row = customerCreditRows(data, "2026-07-12").find((r) => r.customer.code === "C005")!;
    expect(row.position.unappliedCredit).toBe(toPaise(100000));
    expect(row.position.netBalance).toBe(toPaise(-100000));
    expect(row.creditStatus).toBe("Within Limit");
  });

  it("C007 is Near Limit on 31-Aug and Within Limit once paid on 08-Sep", () => {
    const status = (d: string) => customerCreditRows(data, d).find((r) => r.customer.code === "C007")!.creditStatus;
    expect(status("2026-08-31")).toBe("Near Limit"); // 91%
    expect(status("2026-09-15")).toBe("Within Limit");
  });
});

describe("Credit exposure (gross, unapplied and net all visible)", () => {
  const rows = customerCreditRows(data, "2026-08-31");
  it("Sabarmati: outstanding ₹1,88,800, unapplied ₹1,00,000, net ₹88,800 Dr, 36% used", () => {
    const r = rows.find((x) => x.customer.code === "C005")!;
    expect(r.position.outstanding).toBe(toPaise(188800));
    expect(r.position.unappliedCredit).toBe(toPaise(100000));
    expect(r.position.netBalance).toBe(toPaise(88800));
    expect(r.utilisationPct).toBe(36);
    expect(r.creditStatus).toBe("Within Limit");
  });
  it("most utilised first; inactive C008 with nothing open is left out", () => {
    expect(rows.map((r) => r.customer.code)).toEqual(["C003", "C007", "C002", "C004", "C005", "C006", "C001"]);
  });
});

describe("KPIs reuse the engine", () => {
  it("match the dashboard summary and the R17 dso()", () => {
    for (const d of ["2026-08-31", "2026-09-15"]) {
      const k = collectionKpis(data, d);
      const s = dashboardSummary(data, d);
      expect(k.totalReceivables).toBe(s.totalOutstanding);
      expect(k.overdue).toBe(s.overdue);
      expect(k.unappliedCredit).toBe(s.unappliedCredit);
      expect(k.dso).toBe(dso(data, d));
    }
  });
  it("31-Aug counts", () => {
    expect(collectionKpis(data, "2026-08-31")).toMatchObject({
      overduePct: 61,
      customersOverLimit: 1,
      customersNearLimit: 1,
      brokenPromises: 1,
      followUpsDue: 0,
      dso: 111,
    });
  });
});

describe("CSV export rows", () => {
  it("has the agreed columns and plain amounts", () => {
    expect(WORKLIST_CSV_HEADER).toHaveLength(13);
    const items = sortWorklist(filterWorklist(collectionItems(data, "2026-08-31"), { promise: "Broken" }));
    expect(worklistCsvRows(items)).toEqual([
      [
        "C002 Varandha Freight LLP",
        "BWA/26-27/0003",
        "2026-04-18",
        "2026-06-02",
        "69600.00",
        "46-90",
        "90",
        "No",
        "Broken",
        "",
        "Within Limit",
        "Critical",
        "Promise to pay broken; 90 days overdue (46–90); Part-paid",
      ],
    ]);
  });
});

describe("Customer 360", () => {
  it("C002 at 31-Aug", () => {
    const c = customer360(data, find.customer("C002").id, "2026-08-31");
    expect(c).toMatchObject({
      creditLimit: toPaise(300000),
      netBalance: toPaise(223000),
      overdue: toPaise(164000),
      notDue: toPaise(59000),
      unappliedCredit: 0,
      utilisationPct: 74,
      creditStatus: "Within Limit",
      openInvoices: 3,
      overdueInvoices: 2,
      brokenPromises: 1,
      pendingPromises: 0,
      followUpsDue: 0,
    });
    expect(c.oldestOverdue!.invoice.invoiceNo).toBe("BWA/26-27/0003");
    expect(c.lastReceipt!.receipt.receiptNo).toBe("RCT/26-27/0007");
    expect(c.lastReceipt!.settlement).toBe(toPaise(72000));
  });

  it("C005 at 31-Aug: the advance is shown on its own; last receipt is the advance", () => {
    const c = customer360(data, find.customer("C005").id, "2026-08-31");
    expect(c.unappliedCredit).toBe(toPaise(100000));
    expect(c.outstanding).toBe(toPaise(188800));
    expect(c.netBalance).toBe(toPaise(88800));
    expect(c.lastReceipt!.receipt.receiptNo).toBe("RCT/26-27/0011");
  });

  it("activity is newest first with promise and follow-up states", () => {
    const c = customer360(data, find.customer("C004").id, "2026-09-07");
    expect(c.activity.map((a) => [a.note.noteDate, a.invoiceNo, a.followUpState])).toEqual([
      ["2026-08-20", "BWA/26-27/0007", "Due"], // follow-up 05-Sep
      ["2026-07-26", "BWA/26-27/0010", "Upcoming"], // follow-up 10-Sep
    ]);
    expect(c.followUpsDue).toBe(1);
  });

  it("no receipts yet → no last receipt", () => {
    const c = customer360(data, find.customer("C007").id, "2026-05-01");
    expect(c.lastReceipt).toBeNull();
  });
});
