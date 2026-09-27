"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { allocateReceipt } from "../../actions";

type Receipt = {
  id: number;
  receiptNo: string;
  receiptDate: string;
  bankAmount: number;
  tdsAmount: number;
};

type InvoiceOption = {
  invoice: {
    id: number;
    invoiceNo: string;
    invoiceDate: string;
    dueDate: string;
    total: number;
  };
  position: {
    outstanding: number;
  };
};

export default function AllocationForm({
  receipt,
  invoices,
  unapplied,
  asOf,
}: {
  receipt: Receipt;
  invoices: InvoiceOption[];
  unapplied: number;
  asOf: string;
}) {
  const router = useRouter();

  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [allocationDate, setAllocationDate] = useState(receipt.receiptDate);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);

    try {
      const result = await allocateReceipt({
        receiptId: receipt.id,
        invoiceId: Number(invoiceId),
        allocationDate,
        amount: Number(amount),
      });

      if (!result.success) {
        setError(result.error ?? "Unable to allocate receipt.");
        return;
      }

      router.push(`/receipts?asof=${asOf}`);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to allocate receipt.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-6 rounded-xl border bg-white p-6"
    >
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {unapplied <= 0 ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          This receipt has no unapplied amount.
        </div>
      ) : (
        <>
          <div>
            <label className="mb-2 block text-sm font-medium">
              Invoice
            </label>

            <select
              required
              value={invoiceId}
              onChange={(e) => setInvoiceId(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            >
              <option value="">Select invoice</option>

              {invoices.map(({ invoice, position }) => (
                <option key={invoice.id} value={invoice.id}>
                  {invoice.invoiceNo} — Outstanding ₹
                  {(position.outstanding / 100).toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Allocation date
            </label>

            <input
              required
              type="date"
              min={receipt.receiptDate}
              value={allocationDate}
              onChange={(e) => setAllocationDate(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Allocation amount (₹)
            </label>

            <input
              required
              min="0.01"
              step="0.01"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />

            <p className="mt-1 text-xs text-slate-500">
              Maximum unapplied amount: ₹
              {(unapplied / 100).toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Saving..." : "Allocate Receipt"}
            </button>
          </div>
        </>
      )}
    </form>
  );
}