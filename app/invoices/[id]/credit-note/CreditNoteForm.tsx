"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCreditNote } from "../../credit-note-actions";

export default function CreditNoteForm({
  invoiceId,
  invoiceTotal,
  gstRatePct,
  asof,
}: {
  invoiceId: number;
  invoiceTotal: number;
  gstRatePct: number;
  asof: string;
}) {
  const router = useRouter();

  const [taxableValue, setTaxableValue] = useState("");
  const [creditNoteDate, setCreditNoteDate] = useState(asof);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const taxable = Number(taxableValue) || 0;
  const gst = taxable * gstRatePct / 100;
  const total = taxable + gst;

  async function handleSubmit(formData: FormData) {
    setError("");
    setSaving(true);

    const result = await createCreditNote(formData);

    if (!result.success) {
      setError(result.error ?? "Unable to create credit note");
      setSaving(false);
      return;
    }

    router.push(
      `/invoices/${invoiceId}?asof=${encodeURIComponent(asof)}`
    );

    router.refresh();
  }

  return (
    <form
      action={handleSubmit}
      className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <input
        type="hidden"
        name="invoiceId"
        value={invoiceId}
      />

      <div>
        <label className="mb-1.5 block text-sm font-medium">
          Credit Note Date *
        </label>

        <input
          type="date"
          name="creditNoteDate"
          value={creditNoteDate}
          onChange={(event) =>
            setCreditNoteDate(event.target.value)
          }
          required
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium">
          Taxable Value *
        </label>

        <input
          type="number"
          name="taxableValue"
          min="0"
          step="0.01"
          value={taxableValue}
          onChange={(event) =>
            setTaxableValue(event.target.value)
          }
          required
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium">
          Reason *
        </label>

        <textarea
          name="reason"
          value={reason}
          onChange={(event) =>
            setReason(event.target.value)
          }
          required
          rows={3}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="rounded-lg bg-slate-50 p-5">
        <h2 className="font-semibold">Credit Note Preview</h2>

        <div className="mt-3 space-y-2 text-sm">
          <Row label="Taxable Value" value={taxable} />
          <Row label={`GST (${gstRatePct}%)`} value={gst} />

          <div className="border-t border-slate-200 pt-2">
            <Row label="Credit Note Total" value={total} bold />
          </div>

          <div className="pt-2 text-xs text-slate-500">
            Original invoice total: ₹
            {(invoiceTotal / 100).toLocaleString("en-IN", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 border-t border-slate-200 pt-5">
        <button
          type="button"
          onClick={() =>
            router.push(
              `/invoices/${invoiceId}?asof=${encodeURIComponent(asof)}`
            )
          }
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
        >
          Cancel
        </button>

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Saving..." : "Raise Credit Note"}
        </button>
      </div>
    </form>
  );
}

function Row({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: number;
  bold?: boolean;
}) {
  return (
    <div className={`flex justify-between ${bold ? "font-bold" : ""}`}>
      <span>{label}</span>
      <span>
        ₹
        {value.toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </span>
    </div>
  );
}