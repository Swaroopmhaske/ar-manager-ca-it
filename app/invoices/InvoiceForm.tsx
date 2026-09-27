"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createInvoice } from "./actions";

type Customer = {
  id: number;
  code: string;
  name: string;
  state: string | null;
  creditLimit: number;
};

export default function InvoiceForm({
  asof,
  customers,
}: {
  asof: string;
  customers: Customer[];
}) {
  const router = useRouter();

  const [customerId, setCustomerId] = useState("");
  const [taxableValue, setTaxableValue] = useState("");
  const [gstRate, setGstRate] = useState("18");
  const [invoiceDate, setInvoiceDate] = useState(asof);
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedCustomer = customers.find(
    (customer) => customer.id === Number(customerId)
  );

  const taxable = Number(taxableValue) || 0;
  const rate = Number(gstRate) || 0;

  const isMaharashtra =
    selectedCustomer?.state?.toLowerCase() === "maharashtra";

  const gst = taxable * rate / 100;

  const cgst = isMaharashtra ? gst / 2 : 0;
  const sgst = isMaharashtra ? gst / 2 : 0;
  const igst = isMaharashtra ? 0 : gst;

  const total = taxable + gst;

  return (
    <form
      action={async (formData) => {
        setError("");
        setSaving(true);

        const result = await createInvoice(formData);

if (!result.success) {
  setError(result.error ?? "Unable to create invoice");
  setSaving(false);
  return;
}

router.push(
  `/invoices?asof=${encodeURIComponent(asof)}`
);
router.refresh();
      }}
      className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium">
            Customer *
          </label>

          <select
            name="customerId"
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
          <label className="mb-1.5 block text-sm font-medium">
            Invoice Date *
          </label>

          <input
            type="date"
            name="invoiceDate"
            value={invoiceDate}
            onChange={(event) => setInvoiceDate(event.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-1.5 block text-sm font-medium">
            Description *
          </label>

          <input
            name="description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">
            Taxable Value (₹) *
          </label>

          <input
            type="number"
            name="taxableValue"
            min="0"
            step="0.01"
            value={taxableValue}
            onChange={(event) => setTaxableValue(event.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">
            GST Rate (%) *
          </label>

          <input
            type="number"
            name="gstRate"
            min="0"
            max="100"
            step="0.01"
            value={gstRate}
            onChange={(event) => setGstRate(event.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="rounded-lg bg-slate-50 p-5">
        <h2 className="font-semibold">Tax Preview</h2>

        <div className="mt-3 space-y-2 text-sm">
          <Row label="Taxable Value" value={taxable} />

          {isMaharashtra ? (
            <>
              <Row label="CGST" value={cgst} />
              <Row label="SGST" value={sgst} />
            </>
          ) : (
            <Row label="IGST" value={igst} />
          )}

          <div className="border-t border-slate-200 pt-2">
            <Row label="Total" value={total} bold />
          </div>
        </div>
      </div>

      {selectedCustomer && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
          <strong>Credit limit:</strong>{" "}
          ₹{(selectedCustomer.creditLimit / 100).toLocaleString("en-IN")}
          <p className="mt-1 text-amber-800">
            The credit-limit warning will be checked before saving.
          </p>
        </div>
      )}

      <div className="flex justify-end gap-3 border-t border-slate-200 pt-5">
        <button
          type="button"
          onClick={() =>
            router.push(`/invoices?asof=${encodeURIComponent(asof)}`)
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
          {saving ? "Saving..." : "Save Invoice"}
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
      <span>₹{value.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}</span>
    </div>
  );
}