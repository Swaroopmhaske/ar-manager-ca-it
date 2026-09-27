import { describe, expect, it } from "vitest";

import {
  formatAmount,
  formatBalance,
  formatDate,
} from "@/lib/ar/format";

describe("R18 formatting", () => {
  it("formats amounts using Indian digit grouping", () => {
    expect(formatAmount(12345600)).toBe("₹1,23,456.00");
    expect(formatAmount(8850000)).toBe("₹88,500.00");
    expect(formatAmount(300000)).toBe("₹3,000.00");
  });

  it("preserves paisa precision", () => {
    expect(formatAmount(123456789)).toBe("₹12,34,567.89");
    expect(formatAmount(1)).toBe("₹0.01");
    expect(formatAmount(0)).toBe("₹0.00");
  });

  it("formats negative amounts", () => {
    expect(formatAmount(-100000)).toBe("-₹1,000.00");
  });

  it("formats dates as DD-MMM-YYYY", () => {
    expect(formatDate("2026-08-31")).toBe("31-Aug-2026");
    expect(formatDate("2026-05-05")).toBe("05-May-2026");
    expect(formatDate("2026-01-01")).toBe("01-Jan-2026");
  });

  it("adds Dr and Cr suffixes to balances", () => {
    expect(formatBalance(22300000, "Dr")).toBe("₹2,23,000.00 Dr");
    expect(formatBalance(10000000, "Cr")).toBe("₹1,00,000.00 Cr");
  });
});