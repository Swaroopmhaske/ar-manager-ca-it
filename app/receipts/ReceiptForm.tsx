"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createReceipt } from "./actions";

type Customer = {
  id: number;
  code: string;
  name: string;
};

export default function ReceiptForm({
  customers,
  asOf,
}: {
  customers: Customer[];
  asOf: string;
}) {
  const router = useRouter();

  const [customerId, setCustomerId] = useState("");
  const [receiptDate, setReceiptDate] = useState(asOf);
  const [bankAmount, setBankAmount] = useState("");
  const [tdsAmount, setTdsAmount] = useState("0");
  const [mode, setMode] = useState<
    "NEFT" | "RTGS" | "IMPS" | "UPI" | "Cheque"
  >("NEFT");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const settlement =
    (Number(bankAmount) || 0) + (Number(tdsAmount) || 0);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);

    try {
      const result = await createReceipt({
        customerId: Number(customerId),
        receiptDate,
        bankAmount: Number(bankAmount),
        tdsAmount: Number(tdsAmount),
        mode,
        reference: reference || null,
      });

      if (!result.success) {
        setError(result.error ?? "Unable to save receipt.");
        return;
      }

      router.push(`/receipts?asof=${asOf}`);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to save receipt.",
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

      <div>
        <label className="mb-2 block text-sm font-medium">
          Customer
        </label>

        <select
          required
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          className="w-full rounded-lg border px-3 py-2"
        >
          <option value="">Select customer</option>

          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.code} — {customer.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">
          Receipt date
        </label>

        <input
          required
          type="date"
          value={receiptDate}
          onChange={(e) => setReceiptDate(e.target.value)}
          className="w-full rounded-lg border px-3 py-2"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium">
            Bank amount (₹)
          </label>

          <input
            required
            min="0"
            step="0.01"
            type="number"
            value={bankAmount}
            onChange={(e) => setBankAmount(e.target.value)}
            className="w-full rounded-lg border px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">
            TDS amount (₹)
          </label>

          <input
            min="0"
            step="0.01"
            type="number"
            value={tdsAmount}
            onChange={(e) => setTdsAmount(e.target.value)}
            className="w-full rounded-lg border px-3 py-2"
          />
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">
          Payment mode
        </label>

        <select
          required
          value={mode}
          onChange={(e) =>
            setMode(
              e.target.value as
                | "NEFT"
                | "RTGS"
                | "IMPS"
                | "UPI"
                | "Cheque",
            )
          }
          className="w-full rounded-lg border px-3 py-2"
        >
          <option value="NEFT">NEFT</option>
          <option value="RTGS">RTGS</option>
          <option value="IMPS">IMPS</option>
          <option value="UPI">UPI</option>
          <option value="Cheque">Cheque</option>
        </select>
      </div>

      <div className="rounded-lg bg-slate-50 p-4">
        <p className="text-sm text-slate-500">Settlement value</p>

        <p className="mt-1 text-xl font-bold">
          ₹
          {settlement.toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </p>

        <p className="mt-1 text-xs text-slate-500">
          Bank amount + TDS
        </p>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">
          Reference
        </label>

        <input
          type="text"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="UTR / cheque / payment reference"
          className="w-full rounded-lg border px-3 py-2"
        />
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border px-4 py-2 text-sm font-semibold"
        >
          Cancel
        </button>

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Receipt"}
        </button>
      </div>
    </form>
  );
}