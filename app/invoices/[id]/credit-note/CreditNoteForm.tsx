"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCreditNote } from "../../credit-note-actions";
import { documentTotal, gstSplitByMode } from "@/lib/ar/documents";
import { formatAmount } from "@/lib/ar/format";

export default function CreditNoteForm({
  invoiceId,
  gstRatePct,
  intraState,
  available,
  invoiceDate,
  asof,
}: {
  invoiceId: number;
  gstRatePct: number;
  intraState: boolean;
  /** Paise still open on the invoice (total − allocations − credit notes). */
  available: number;
  invoiceDate: string;
  asof: string;
}) {
  const router = useRouter();
  const [taxableValue, setTaxableValue] = useState("");
  const [creditNoteDate, setCreditNoteDate] = useState(asof < invoiceDate ? invoiceDate : asof);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Same functions the server uses (R7: the invoice's rate and split).
  const taxable = Math.round((Number(taxableValue) || 0) * 100);
  const gst = gstSplitByMode(intraState, taxable, gstRatePct);
  const total = documentTotal(taxable, gst);
  const tooBig = total > available;

  async function handleSubmit(formData: FormData) {
    setError("");
    setSaving(true);
    const result = await createCreditNote(formData);
    if (!result.success) {
      setError(result.error ?? "Unable to create credit note");
      setSaving(false);
      return;
    }
    router.push(`/invoices/${invoiceId}?asof=${encodeURIComponent(asof)}`);
    router.refresh();
  }

  return (
    <form action={handleSubmit} className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      <input type="hidden" name="invoiceId" value={invoiceId} />

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium">Credit note date *</label>
          <input
            type="date"
            name="creditNoteDate"
            value={creditNoteDate}
            min={invoiceDate}
            onChange={(e) => setCreditNoteDate(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">Taxable value (₹) *</label>
          <input
            type="number"
            name="taxableValue"
            min="0.01"
            step="0.01"
            value={taxableValue}
            onChange={(e) => setTaxableValue(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium">Reason *</label>
        <textarea
          name="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          rows={3}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="rounded-lg bg-slate-50 p-5 text-sm">
        <h2 className="font-semibold">Credit note preview</h2>
        <div className="mt-3 space-y-2">
          <Row label="Taxable value" value={formatAmount(taxable)} />
          {intraState ? (
            <>
              <Row label={`CGST (${gstRatePct / 2}%)`} value={formatAmount(gst.cgst)} />
              <Row label={`SGST (${gstRatePct / 2}%)`} value={formatAmount(gst.sgst)} />
            </>
          ) : (
            <Row label={`IGST (${gstRatePct}%)`} value={formatAmount(gst.igst)} />
          )}
          <div className="border-t border-slate-200 pt-2">
            <Row label="Credit note total" value={formatAmount(total)} bold />
          </div>
          <p className={`pt-1 text-xs ${tooBig ? "font-medium text-red-700" : "text-slate-500"}`}>
            Still open on this invoice: {formatAmount(available)}
            {tooBig && " — the credit note cannot be larger than this."}
          </p>
        </div>
      </div>

      <div className="flex justify-end gap-3 border-t border-slate-200 pt-5">
        <button
          type="button"
          onClick={() => router.push(`/invoices/${invoiceId}?asof=${encodeURIComponent(asof)}`)}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || tooBig}
          className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Saving..." : "Raise credit note"}
        </button>
      </div>
    </form>
  );
}

function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-bold" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
