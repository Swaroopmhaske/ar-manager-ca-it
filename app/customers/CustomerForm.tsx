"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createCustomer,
  updateCustomer,
} from "./actions/customer-actions";

type Customer = {
  id: number;
  code: string;
  name: string;
  city: string | null;
  state: string | null;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  gstin: string | null;
  creditDays: number;
  creditLimit: number;
  tdsRatePct: number;
  isActive: boolean;
};

export default function CustomerForm({
  asof,
  customer,
}: {
  asof: string;
  customer?: Customer;
}) {
  const router = useRouter();

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const editing = Boolean(customer);

  async function handleSubmit(formData: FormData) {
    setError("");
    setSaving(true);

    const result = editing
      ? await updateCustomer(customer!.id, formData)
      : await createCustomer(formData);

    if (!result.success) {
      setError(result.error ?? "Unable to save customer");
      setSaving(false);
      return;
    }

    router.push(
      editing
        ? `/customers/${customer!.id}?asof=${encodeURIComponent(asof)}`
        : `/customers?asof=${encodeURIComponent(asof)}`
    );

    router.refresh();
  }

  return (
    <form
      action={handleSubmit}
      className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <Field
          label="Customer Code *"
          name="code"
          required
          defaultValue={customer?.code ?? ""}
        />

        <Field
          label="Customer Name *"
          name="name"
          required
          defaultValue={customer?.name ?? ""}
        />

        <Field
          label="City"
          name="city"
          defaultValue={customer?.city ?? ""}
        />

        <Field
          label="State"
          name="state"
          defaultValue={customer?.state ?? ""}
        />

        <Field
          label="Contact Person"
          name="contactPerson"
          defaultValue={customer?.contactPerson ?? ""}
        />

        <Field
          label="Email"
          name="email"
          type="email"
          defaultValue={customer?.email ?? ""}
        />

        <Field
          label="Phone"
          name="phone"
          defaultValue={customer?.phone ?? ""}
        />

        <Field
          label="GSTIN"
          name="gstin"
          maxLength={15}
          defaultValue={customer?.gstin ?? ""}
        />

        <Field
          label="Credit Days *"
          name="creditDays"
          type="number"
          min="0"
          defaultValue={String(customer?.creditDays ?? 0)}
          required
        />

        <Field
          label="Credit Limit (₹) *"
          name="creditLimit"
          type="number"
          min="0"
          step="0.01"
          defaultValue={
            customer ? String(customer.creditLimit / 100) : "0"
          }
          required
        />

        <Field
          label="TDS Rate (%) *"
          name="tdsRatePct"
          type="number"
          min="0"
          max="100"
          step="0.01"
          defaultValue={String(customer?.tdsRatePct ?? 0)}
          required
        />
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-5">
        <button
          type="button"
          onClick={() =>
            router.push(
              editing
                ? `/customers/${customer!.id}?asof=${encodeURIComponent(asof)}`
                : `/customers?asof=${encodeURIComponent(asof)}`
            )
          }
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
        >
          Cancel
        </button>

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving
            ? "Saving..."
            : editing
              ? "Update Customer"
              : "Save Customer"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required = false,
  min,
  max,
  step,
  defaultValue,
  maxLength,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  min?: string;
  max?: string;
  step?: string;
  defaultValue?: string;
  maxLength?: number;
}) {
  return (
    <div>
      <label
        htmlFor={name}
        className="mb-1.5 block text-sm font-medium text-slate-700"
      >
        {label}
      </label>

      <input
        id={name}
        name={name}
        type={type}
        required={required}
        min={min}
        max={max}
        step={step}
        defaultValue={defaultValue}
        maxLength={maxLength}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
      />
    </div>
  );
}