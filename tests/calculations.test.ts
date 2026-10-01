import { describe, expect, it } from "vitest";
import type { ArData } from "@/lib/ar/types";
import {
  balanceCheck,
  controlCheck,
  customerPosition,
  invoicePosition,
  statement,
  dso,
  notePositions,
  promiseStatus,
} from "@/lib/ar/calculations";
import { eachDay, makeData, toPaise } from "./helpers";

const data = makeData();

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
    // Spot check 3 said 61–90 under the brief's bands; with the client's
    // new bands 90 days past due falls in 46–90.
    expect(position!.bucket).toBe("46-90");
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
describe("R14 control check", () => {
  it("has no differences for any customer as at 31-Aug-2026", () => {
    const checks = controlCheck(data, "2026-08-31");

    expect(checks).toHaveLength(data.customers.length);
    expect(checks.every((check) => check.passed)).toBe(true);
    expect(checks.every((check) => check.difference === 0)).toBe(true);
  });

  it("has no differences for any customer on multiple dates", () => {
    const dates = [
      "2026-04-01",
      "2026-07-12",
      "2026-08-31",
      "2026-09-06",
      "2026-09-15",
    ];

    for (const asOf of dates) {
      const checks = controlCheck(data, asOf);

      expect(
        checks.every((check) => check.passed),
        `R14 failed for ${asOf}`
      ).toBe(true);
    }
  });
});
describe("R14 balanceCheck, every day", () => {
  it("is empty for every day from 2026-01-01 to 2026-10-31 (spot check 10)", () => {
    for (const asOf of eachDay("2026-01-01", "2026-10-31")) {
      expect(balanceCheck(data, asOf), `differences on ${asOf}`).toEqual([]);
    }
  });

  it("every statement's closing balance equals the R14 document balance", () => {
    for (const customer of data.customers) {
      for (const to of ["2026-04-30", "2026-07-12", "2026-08-31", "2026-09-30"]) {
        const result = statement(data, customer.id, "2026-04-01", to);
        const r14 = controlCheck(data, to).find((c) => c.customerId === customer.id)!;
        expect(result.closingBalance, `${customer.code} to ${to}`).toBe(r14.expected);
      }
    }
  });
});

describe("R15 statement", () => {
  it("calculates the published C002 statement check", () => {
    const result = statement(
      data,
      data.customers.find((customer) => customer.code === "C002")!.id,
      "2026-04-01",
      "2026-08-31"
    );

    expect(result.openingBalance).toBe(7080000);
    expect(result.closingBalance).toBe(22300000);
    expect(result.lines).toHaveLength(7);
  });

  it("keeps same-day lines in the required order", () => {
    const result = statement(
      data,
      data.customers.find((customer) => customer.code === "C002")!.id,
      "2026-04-01",
      "2026-08-31"
    );

    const order = {
      Invoice: 1,
      "Credit Note": 2,
      "Payment received": 3,
      "TDS deducted by you": 4,
    };

    for (let i = 1; i < result.lines.length; i++) {
      const previous = result.lines[i - 1];
      const current = result.lines[i];

      if (previous.date === current.date) {
        expect(order[previous.type]).toBeLessThanOrEqual(
          order[current.type]
        );
      }
    }
  });

  it("keeps TDS as a separate credit line", () => {
    const result = statement(
      data,
      data.customers.find((customer) => customer.code === "C004")!.id,
      "2026-08-01",
      "2026-08-31"
    );

    const tdsLines = result.lines.filter(
      (line) => line.type === "TDS deducted by you"
    );

    expect(tdsLines.length).toBeGreaterThan(0);

    for (const line of tdsLines) {
      expect(line.debit).toBe(0);
      expect(line.credit).toBeGreaterThan(0);
    }
  });

  it("does not include cancelled invoices", () => {
    const result = statement(
      data,
      data.customers.find((customer) => customer.code === "C003")!.id,
      "2026-01-01",
      "2026-09-30"
    );

    const cancelledInvoice = data.invoices.find(
      (invoice) => invoice.isCancelled
    );

    if (
      cancelledInvoice?.customerId ===
      data.customers.find((customer) => customer.code === "C003")!.id
    ) {
      expect(
        result.lines.some(
          (line) => line.documentNo === cancelledInvoice.invoiceNo
        )
      ).toBe(false);
    }
  });

  it("closing balance agrees with R14 customer position", () => {
    const customer = data.customers.find(
      (customer) => customer.code === "C002"
    )!;

    const result = statement(
      data,
      customer.id,
      "2026-04-01",
      "2026-08-31"
    );

    const position = customerPosition(
      data,
      customer.id,
      "2026-08-31"
    );

    expect(result.closingBalance).toBe(position.netBalance);
  });

  it("keeps unapplied credit separate from the statement balance", () => {
    const customer = data.customers.find(
      (customer) => customer.code === "C005"
    )!;

    const result = statement(
      data,
      customer.id,
      "2026-07-01",
      "2026-08-31"
    );

    expect(result.unappliedCredit).toBe(10000000);
  });
});
describe("R16 notes and promises", () => {
  it("marks the published C002 promise as Broken", () => {
    const note = data.notes.find(
      (item) =>
        item.customerId ===
          data.customers.find(
            (customer) => customer.code === "C002"
          )!.id &&
        item.noteDate === "2026-07-20"
    );

    expect(note).toBeDefined();

    expect(
      promiseStatus(data, note!, "2026-08-31")
    ).toBe("Broken");
  });

  it("identifies open follow-ups due as at the selected date", () => {
    const positions = notePositions(
      data,
      "2026-09-06"
    );

    const dueFollowUps = positions.filter(
      (position) => position.followUpDue
    );

    expect(dueFollowUps.length).toBeGreaterThan(0);

    for (const position of dueFollowUps) {
      expect(position.note.followUpDate).not.toBeNull();
      expect(position.note.followUpDate! <= "2026-09-06").toBe(true);
      expect(position.note.followUpDone).toBe(false);
    }
  });

  it("does not consider notes dated after the as-at date", () => {
    const positions = notePositions(
      data,
      "2026-07-01"
    );

    expect(
      positions.every(
        (position) => position.note.noteDate <= "2026-07-01"
      )
    ).toBe(true);
  });
});
describe("R17 DSO", () => {
  it("returns a whole number of days", () => {
    const result = dso(data, "2026-08-31");

    expect(result).not.toBeNull();
    expect(Number.isInteger(result)).toBe(true);
  });

  it("uses a 90-day invoice window ending on the as-at date", () => {
    const asOf = "2026-08-31";
    const result = dso(data, asOf);

    expect(result).not.toBeNull();

    const windowStart = "2026-06-03";

    const invoicesInWindow = data.invoices.filter(
      (invoice) =>
        !invoice.isCancelled &&
        invoice.invoiceDate >= windowStart &&
        invoice.invoiceDate <= asOf
    );

    expect(invoicesInWindow.length).toBeGreaterThan(0);
  });

  it("returns null when the denominator is zero", () => {
    const emptyData: ArData = {
      customers: data.customers,
      invoices: [],
      creditNotes: [],
      receipts: [],
      allocations: [],
      notes: [],
    };

    expect(
      dso(emptyData, "2026-08-31")
    ).toBeNull();
  });
});