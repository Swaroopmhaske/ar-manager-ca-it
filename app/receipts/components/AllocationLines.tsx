"use client";

import type { OpenInvoice } from "@/lib/ar/payments";
import { formatAmount, formatDate } from "@/lib/ar/format";

/**
 * Editable allocation table shared by "Record payment" and "Allocate credit".
 * `amounts` holds what the user sees in each box (rupee strings).
 */
export default function AllocationLines({
  open,
  amounts,
  onChange,
}: {
  open: OpenInvoice[];
  amounts: Record<number, string>;
  onChange: (invoiceId: number, value: string) => void;
}) {
  if (open.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
        No open invoices on or before this date. Anything received stays as unapplied credit.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left">
          <tr>
            <th className="px-3 py-2">Invoice</th>
            <th className="px-3 py-2">Invoice date</th>
            <th className="px-3 py-2">Due date</th>
            <th className="px-3 py-2 text-right">Open</th>
            <th className="px-3 py-2 text-right">Allocate (₹)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {open.map((row) => {
            const value = amounts[row.invoice.id] ?? "";
            const paise = Math.round((Number(value) || 0) * 100);
            const tooMuch = paise > row.open;
            return (
              <tr key={row.invoice.id}>
                <td className="px-3 py-2 font-medium">
                  {row.invoice.invoiceNo}
                  {row.invoice.isDisputed && (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">Disputed</span>
                  )}
                </td>
                <td className="px-3 py-2">{formatDate(row.invoice.invoiceDate)}</td>
                <td className="px-3 py-2">{formatDate(row.invoice.dueDate)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatAmount(row.open)}</td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    aria-label={`Allocate to ${row.invoice.invoiceNo}`}
                    value={value}
                    onChange={(e) => onChange(row.invoice.id, e.target.value)}
                    className={`w-36 rounded border px-2 py-1 text-right tabular-nums ${
                      tooMuch ? "border-red-400 bg-red-50" : "border-slate-300"
                    }`}
                  />
                  {tooMuch && <p className="mt-1 text-xs text-red-700">More than is open</p>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Rupee string → whole paise. */
export const toPaise = (value: string) => Math.round((Number(value) || 0) * 100);
/** Whole paise → rupee string for an input box ("" for zero). */
export const toInput = (paise: number) => (paise > 0 ? (paise / 100).toFixed(2) : "");
