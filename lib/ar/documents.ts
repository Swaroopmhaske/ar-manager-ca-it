import type { ArData, Paise } from "./types";
import { addDays } from "./date";

/** R2: due date = invoice date + credit days, in calendar days. */
export function dueDate(invoiceDate: string, creditDays: number): string {
  return addDays(invoiceDate, creditDays);
}

export interface GstSplit {
  cgst: Paise;
  sgst: Paise;
  igst: Paise;
}

/**
 * R3: Maharashtra customers get CGST + SGST at half the rate each;
 * everyone else gets IGST at the full rate.
 * Each component is rounded to the nearest paisa on its own, halves up.
 */
export function gstSplit(
  state: string | null,
  taxable: Paise,
  ratePct: number
): GstSplit {
  return gstSplitByMode(isIntraState(state), taxable, ratePct);
}

/** The seller is in Maharashtra, so a Maharashtra customer is intra-state. */
export function isIntraState(state: string | null): boolean {
  return (state ?? "").trim().toLowerCase() === "maharashtra";
}

/**
 * The same rule as `gstSplit`, for when the split is already decided:
 * R7 says a credit note uses its INVOICE's split, whatever the customer's
 * state says today.
 */
export function gstSplitByMode(
  intraState: boolean,
  taxable: Paise,
  ratePct: number
): GstSplit {
  if (intraState) {
    const half = Math.round((taxable * ratePct) / 200);
    return { cgst: half, sgst: half, igst: 0 };
  }

  return { cgst: 0, sgst: 0, igst: Math.round((taxable * ratePct) / 100) };
}

/** R3: total = taxable value + all GST components. */
export function documentTotal(taxable: Paise, gst: GstSplit): Paise {
  return taxable + gst.cgst + gst.sgst + gst.igst;
}

/** R4: Indian financial year label, April to March. "2026-08-31" -> "26-27". */
export function fyLabel(date: string): string {
  const [year, month] = date.split("-").map(Number);
  const startYear = month >= 4 ? year : year - 1;
  const yy = (y: number) => String(y % 100).padStart(2, "0");
  return `${yy(startYear)}-${yy(startYear + 1)}`;
}

export type DocumentSeries = "invoice" | "creditNote" | "receipt";

const SERIES = {
  invoice: { prefix: (fy: string) => `BWA/${fy}/`, digits: 4 },
  creditNote: { prefix: (fy: string) => `BWA/CN/${fy}/`, digits: 3 },
  receipt: { prefix: (fy: string) => `RCT/${fy}/`, digits: 4 },
} as const;

/**
 * R4: next number in a series for the financial year containing `date`.
 * Looks at every existing number (cancelled invoices included), so no
 * number is ever reused.
 */
export function nextNumber(
  series: DocumentSeries,
  data: Pick<ArData, "invoices" | "creditNotes" | "receipts">,
  date: string
): string {
  const { prefix: makePrefix, digits } = SERIES[series];
  const prefix = makePrefix(fyLabel(date));

  const existing: string[] =
    series === "invoice"
      ? data.invoices.map((i) => i.invoiceNo)
      : series === "creditNote"
        ? data.creditNotes.map((c) => c.creditNoteNo)
        : data.receipts.map((r) => r.receiptNo);

  let max = 0;
  for (const no of existing) {
    if (!no.startsWith(prefix)) continue;
    const tail = no.slice(prefix.length);
    if (/^\d+$/.test(tail)) max = Math.max(max, Number(tail));
  }

  return `${prefix}${String(max + 1).padStart(digits, "0")}`;
}