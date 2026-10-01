"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createInvoice, previewInvoice } from "./actions";
import type { InvoiceDraft } from "@/lib/ar/drafts";
import { formatAmount, formatDate, formatDrCr } from "@/lib/ar/format";

type Customer = { id: number; code: string; name: string };

export default function InvoiceForm({
  asof,
  customers,
  initialCustomerId,
}: {
  asof: string;
  customers: Customer[];
  initialCustomerId?: number;
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState(initialCustomerId ? String(initialCustomerId) : "");
  const [invoiceDate, setInvoiceDate] = useState(asof);
  const [description, setDescription] = useState("");
  const [taxableValue, setTaxableValue] = useState("");
  const [gstRate, setGstRate] = useState("18");
  const [draft, setDraft] = useState<InvoiceDraft | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Preview comes from the server (lib/ar), the same calculation the save uses.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await previewInvoice({
        customerId: Number(customerId),
        invoiceDate,
        taxableValue: Number(taxableValue) || 0,
        gstRate: Number(gstRate) || 0,
      });
      if (!cancelled) setDraft(result.ok ? result.draft : null);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [customerId, invoiceDate, taxableValue, gstRate]);

  const overLimit = draft?.creditLimit?.exceedsLimit ?? false;

  async function save() {
    setError("");
    setSaving(true);
    const result = await createInvoice({
      customerId: Number(customerId),
      invoiceDate,
      description,
      taxableValue: Number(taxableValue),
      gstRate: Number(gstRate),
      // The warning is on screen next to the button, so saving is acknowledging it.
      acknowledgeLimit: overLimit,
    });
    if (result.success) {
      router.push(`/invoices/${result.invoiceId}?asof=${encodeURIComponent(asof)}`);
      router.refresh();
      return;
    }
    setSaving(false);
    if ("needsConfirmation" in result) {
      setDraft(result.draft); // figures moved since the preview: show the warning again
      setError("This invoice now takes the customer over the credit limit. Check the warning and save again to go ahead.");
    } else {
      setError(result.error);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Customer *">
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Select an active customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Invoice date *">
          <input
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>
        <div className="md:col-span-2">
          <Field label="Description *">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              maxLength={500}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </Field>
        </div>
        <Field label="Taxable value (₹) *">
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={taxableValue}
            onChange={(e) => setTaxableValue(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="GST rate (%) *">
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={gstRate}
            onChange={(e) => setGstRate(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>
      </div>

      <div className="rounded-lg bg-slate-50 p-5 text-sm">
        <h2 className="font-semibold">Preview before saving</h2>
        {!draft?.customer ? (
          <p className="mt-2 text-slate-500">Choose a customer and date to see the number, due date and tax.</p>
        ) : (
          <div className="mt-3 grid gap-x-10 gap-y-2 md:grid-cols-2">
            <Row label="Invoice number" value={draft.invoiceNo} />
            <Row label="Due date" value={`${formatDate(draft.dueDate)} (${draft.customer.creditDays} days)`} />
            <Row label="Taxable value" value={formatAmount(Math.round((Number(taxableValue) || 0) * 100))} />
            {draft.intraState ? (
              <>
                <Row label={`CGST (${Number(gstRate) / 2}%)`} value={formatAmount(draft.gst.cgst)} />
                <Row label={`SGST (${Number(gstRate) / 2}%)`} value={formatAmount(draft.gst.sgst)} />
              </>
            ) : (
              <Row label={`IGST (${gstRate}%)`} value={formatAmount(draft.gst.igst)} />
            )}
            <Row label="Invoice total" value={formatAmount(draft.total)} bold />
          </div>
        )}
      </div>

      {draft?.creditLimit && overLimit && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Warning: this invoice takes {draft.customer?.name} over the credit limit.</p>
          <div className="mt-2 grid gap-1 md:grid-cols-2">
            <Row label="Credit limit" value={formatAmount(draft.creditLimit.creditLimit)} />
            <Row label="Current net balance" value={formatDrCr(draft.creditLimit.currentNetBalance)} />
            <Row label="This invoice" value={formatAmount(draft.creditLimit.newInvoiceTotal)} />
            <Row label="Net balance after" value={formatDrCr(draft.creditLimit.projectedNetBalance)} bold />
          </div>
          <p className="mt-2">You can still save it. Net balance already deducts unapplied credit.</p>
        </div>
      )}

      <div className="flex justify-end gap-3 border-t border-slate-200 pt-5">
        <button
          type="button"
          onClick={() => router.push(`/invoices?asof=${encodeURIComponent(asof)}`)}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || (draft?.errors.length ?? 0) > 0}
          className={`rounded-lg px-5 py-2 text-sm font-medium text-white disabled:opacity-50 ${
            overLimit ? "bg-amber-600 hover:bg-amber-700" : "bg-slate-900 hover:bg-slate-700"
          }`}
        >
          {saving ? "Saving..." : overLimit ? "Save anyway" : "Save invoice"}
        </button>
      </div>
      {draft && draft.errors.length > 0 && draft.customer && (
        <p className="text-right text-sm text-red-700">{draft.errors.join(" ")}</p>
      )}
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${bold ? "font-bold" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
