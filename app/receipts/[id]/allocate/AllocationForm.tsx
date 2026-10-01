"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { allocateReceipt } from "../../actions";
import AllocationLines, { toInput, toPaise } from "../../components/AllocationLines";
import { suggestAllocation, type OpenInvoice } from "@/lib/ar/payments";
import { formatAmount } from "@/lib/ar/format";

export default function AllocationForm({
  receiptId,
  receiptDate,
  available,
  openInvoices,
  defaultDate,
  backHref,
}: {
  receiptId: number;
  receiptDate: string;
  /** Paise still free on the receipt (any date). */
  available: number;
  /** The customer's open invoices (any date), oldest first. */
  openInvoices: OpenInvoice[];
  defaultDate: string;
  backHref: string;
}) {
  const router = useRouter();
  const [allocationDate, setAllocationDate] = useState(defaultDate);
  const [amountsTyped, setAmountsTyped] = useState<Record<number, string> | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const open = openInvoices.filter((r) => r.invoice.invoiceDate <= allocationDate);
  const amounts =
    amountsTyped ??
    Object.fromEntries(suggestAllocation(open, available).map((l) => [l.invoiceId, toInput(l.amount)]));
  const lines = open
    .map((r) => ({ invoiceId: r.invoice.id, amount: toPaise(amounts[r.invoice.id] ?? "") }))
    .filter((l) => l.amount > 0);
  const allocating = lines.reduce((s, l) => s + l.amount, 0);
  const left = available - allocating;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const result = await allocateReceipt({
      receiptId,
      allocationDate,
      allocations: lines.map((l) => ({ invoiceId: l.invoiceId, amount: l.amount / 100 })),
    });
    if (!result.success) {
      setError(result.error);
      setSaving(false);
      return;
    }
    router.push(backHref);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border bg-white p-6">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Allocation date *</span>
          <input
            type="date"
            value={allocationDate}
            min={receiptDate}
            onChange={(e) => {
              setAllocationDate(e.target.value);
              setAmountsTyped(null);
            }}
            required
            className="rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <div className="flex gap-2 text-xs">
          <button type="button" onClick={() => setAmountsTyped(null)} className="rounded border border-slate-300 px-2 py-1">
            Suggest oldest first
          </button>
          <button type="button" onClick={() => setAmountsTyped({})} className="rounded border border-slate-300 px-2 py-1">
            Clear all
          </button>
        </div>
      </div>

      <AllocationLines open={open} amounts={amounts} onChange={(id, v) => setAmountsTyped({ ...amounts, [id]: v })} />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-4 text-sm">
        <span>
          Allocating <strong className="tabular-nums">{formatAmount(allocating)}</strong> · still unapplied after this:{" "}
          <strong className={`tabular-nums ${left < 0 ? "text-red-700" : ""}`}>{formatAmount(left)}</strong>
        </span>
        <button
          type="submit"
          disabled={saving || allocating <= 0 || left < 0}
          className="rounded-lg bg-slate-900 px-5 py-2 font-medium text-white disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save allocation"}
        </button>
      </div>
    </form>
  );
}
