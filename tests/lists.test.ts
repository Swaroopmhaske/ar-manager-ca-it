import { describe, expect, it } from "vitest";
import {
  CUSTOMER_SORT_KEYS,
  INVOICE_SORT_KEYS,
  compareValues,
  customerSortValue,
  invoiceSortValue,
  customerListRows,
  filterCustomerRows,
  filterInvoiceRows,
  invoiceListRows,
  invoiceListTotals,
  sortCustomerRows,
  sortInvoiceRows,
} from "@/lib/ar/lists";
import { customerPosition, dso, statement } from "@/lib/ar/calculations";
import { dashboardSummary } from "@/lib/ar/attention";
import { finders, makeData, toPaise } from "./helpers";

const data = makeData();
const find = finders(data);
const asOf = "2026-08-31";
const rows = invoiceListRows(data, asOf);
const numbers = (list: { invoice: { invoiceNo: string } }[]) => list.map((r) => r.invoice.invoiceNo);

describe("Cancelled invoices (R8)", () => {
  it("BWA/26-27/0014 appears in the list with status Cancelled", () => {
    const row = rows.find((r) => r.invoice.invoiceNo === "BWA/26-27/0014");
    expect(row).toBeDefined();
    expect(row!.status).toBe("Cancelled");
    expect(row!.outstanding).toBe(0);
    expect(row!.bucket).toBeNull();
  });

  it("the Cancelled filter finds it", () => {
    expect(numbers(filterInvoiceRows(rows, { status: "Cancelled" }))).toEqual(["BWA/26-27/0014"]);
  });

  it("other status filters do not include it", () => {
    for (const status of ["Paid", "Due", "Overdue"] as const) {
      expect(numbers(filterInvoiceRows(rows, { status }))).not.toContain("BWA/26-27/0014");
    }
  });

  it("is left out of list totals", () => {
    const all = invoiceListTotals(rows);
    const live = rows.filter((r) => r.status !== "Cancelled");
    expect(all.count).toBe(rows.length);
    expect(all.total).toBe(live.reduce((s, r) => s + r.invoice.total, 0));
    expect(invoiceListTotals(filterInvoiceRows(rows, { status: "Cancelled" })).total).toBe(0);
  });

  it("is left out of balances, ageing, statements, DSO and the dashboard", () => {
    const c007 = find.customer("C007");
    const cancelled = find.invoice("BWA/26-27/0014");

    const position = customerPosition(data, c007.id, asOf);
    const without = { ...data, invoices: data.invoices.filter((i) => i.id !== cancelled.id) };

    expect(customerPosition(without, c007.id, asOf)).toEqual(position);
    expect(dso(without, asOf)).toBe(dso(data, asOf));
    expect(dashboardSummary(without, asOf)).toEqual(dashboardSummary(data, asOf));
    expect(
      statement(data, c007.id, "2026-04-01", asOf).lines.map((l) => l.documentNo)
    ).not.toContain("BWA/26-27/0014");
  });
});

describe("Invoice filters", () => {
  it("searches by invoice number", () => {
    expect(numbers(filterInvoiceRows(rows, { q: "0007" }))).toEqual(["BWA/26-27/0007"]);
    expect(filterInvoiceRows(rows, { q: "25-26" })).toHaveLength(5);
  });

  it("filters by customer", () => {
    const c005 = find.customer("C005");
    expect(numbers(filterInvoiceRows(rows, { customerId: c005.id }))).toEqual([
      "BWA/26-27/0017",
      "BWA/26-27/0022",
    ]);
  });

  it("filters by disputed flag", () => {
    expect(numbers(filterInvoiceRows(rows, { disputed: "yes" }))).toEqual(["BWA/26-27/0010"]);
    expect(filterInvoiceRows(rows, { disputed: "no" })).toHaveLength(rows.length - 1);
  });

  it("filters by an inclusive invoice-date range", () => {
    const july = filterInvoiceRows(rows, { from: "2026-07-01", to: "2026-07-31" });
    expect(numbers(july).sort()).toEqual([
      "BWA/26-27/0014",
      "BWA/26-27/0015",
      "BWA/26-27/0016",
      "BWA/26-27/0017",
      "BWA/26-27/0018",
      "BWA/26-27/0019",
    ]);
  });

  it("combines filters", () => {
    const c007 = find.customer("C007");
    const result = filterInvoiceRows(rows, { customerId: c007.id, status: "Overdue" });
    expect(result.every((r) => r.invoice.customerId === c007.id && r.status === "Overdue")).toBe(true);
  });

  it("only lists invoices dated on or before the as-at date", () => {
    expect(numbers(rows)).not.toContain("BWA/26-27/0024"); // dated 05-Sep
    expect(rows).toHaveLength(28);
  });

  it("totals of a filtered list match its rows", () => {
    const c002 = filterInvoiceRows(rows, { customerId: find.customer("C002").id });
    expect(invoiceListTotals(c002).outstanding).toBe(
      customerPosition(data, find.customer("C002").id, asOf).outstanding
    );
  });
});

describe("Invoice sorting", () => {
  it.each(INVOICE_SORT_KEYS)("sorts by %s in both directions", (key) => {
    const asc = sortInvoiceRows(rows, key, "asc");
    const desc = sortInvoiceRows(rows, key, "desc");
    expect(asc).toHaveLength(rows.length);
    expect(new Set(numbers(asc))).toEqual(new Set(numbers(rows)));
    for (let i = 1; i < rows.length; i++) {
      expect(compareValues(invoiceSortValue(asc[i - 1], key), invoiceSortValue(asc[i], key))).toBeLessThanOrEqual(0);
      expect(compareValues(invoiceSortValue(desc[i - 1], key), invoiceSortValue(desc[i], key))).toBeGreaterThanOrEqual(0);
    }
  });

  it("really reorders by amount", () => {
    const totals = sortInvoiceRows(rows, "total", "asc").map((r) => r.invoice.total);
    expect(totals).toEqual([...totals].sort((a, b) => a - b));
    const desc = sortInvoiceRows(rows, "outstanding", "desc").map((r) => r.outstanding);
    expect(desc).toEqual([...desc].sort((a, b) => b - a));
  });

  it("really reorders by date and by days late", () => {
    const due = sortInvoiceRows(rows, "dueDate", "desc").map((r) => r.invoice.dueDate);
    expect(due).toEqual([...due].sort().reverse());
    const late = sortInvoiceRows(rows, "daysLate", "desc");
    expect(late[0].invoice.invoiceNo).toBe("BWA/25-26/0141"); // the oldest overdue
  });

  it("toggling direction reverses the order (ties broken by invoice number)", () => {
    const asc = numbers(sortInvoiceRows(rows, "invoiceNo", "asc"));
    const desc = numbers(sortInvoiceRows(rows, "invoiceNo", "desc"));
    expect(desc).toEqual([...asc].reverse());
  });

  it("does not change the input array", () => {
    const before = numbers(rows);
    sortInvoiceRows(rows, "total", "desc");
    expect(numbers(rows)).toEqual(before);
  });
});

describe("Customer list", () => {
  const customers = customerListRows(data, asOf);
  const codes = (list: typeof customers) => list.map((r) => r.customer.code);

  it("searches code, name, contact and email", () => {
    expect(codes(filterCustomerRows(customers, { q: "c005" }))).toEqual(["C005"]);
    expect(codes(filterCustomerRows(customers, { q: "sabarmati" }))).toEqual(["C005"]);
    expect(codes(filterCustomerRows(customers, { q: "rohan" }))).toEqual(["C002"]);
    expect(codes(filterCustomerRows(customers, { q: "mulshiagro@" }))).toEqual(["C006"]);
  });

  it("filters active / inactive", () => {
    expect(codes(filterCustomerRows(customers, { active: "inactive" }))).toEqual(["C008"]);
    expect(filterCustomerRows(customers, { active: "active" })).toHaveLength(7);
  });

  it.each(CUSTOMER_SORT_KEYS)("sorts by %s in both directions", (key) => {
    const asc = sortCustomerRows(customers, key, "asc");
    const desc = sortCustomerRows(customers, key, "desc");
    expect(new Set(codes(asc))).toEqual(new Set(codes(customers)));
    expect(desc).toHaveLength(customers.length);
    for (let i = 1; i < customers.length; i++) {
      expect(compareValues(customerSortValue(asc[i - 1], key), customerSortValue(asc[i], key))).toBeLessThanOrEqual(0);
      expect(compareValues(customerSortValue(desc[i - 1], key), customerSortValue(desc[i], key))).toBeGreaterThanOrEqual(0);
    }
  });

  it("really reorders by balance", () => {
    const desc = sortCustomerRows(customers, "balance", "desc");
    expect(desc[0].customer.code).toBe("C007"); // ₹7,31,600 Dr, the largest
    const balances = desc.map((r) => r.position.netBalance);
    expect(balances).toEqual([...balances].sort((a, b) => b - a));
  });

  it("reorders by name both ways", () => {
    const asc = codes(sortCustomerRows(customers, "name", "asc"));
    const desc = codes(sortCustomerRows(customers, "name", "desc"));
    expect(desc).toEqual([...asc].reverse());
    expect(asc[0]).toBe("C008"); // Kamshet comes first alphabetically
  });

  it("C007's balance is ₹7,31,600", () => {
    const c007 = customers.find((r) => r.customer.code === "C007")!;
    expect(c007.position.netBalance).toBe(toPaise(731600));
  });
});
