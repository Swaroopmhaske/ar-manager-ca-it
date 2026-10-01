"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createReceiptWithAllocations } from "./actions";
import AllocationLines, { toInput, toPaise } from "./components/AllocationLines";
import {
  expectedTds,
  suggestAllocation,
  unappliedAfter,
  type OpenInvoice,
} from "@/lib/ar/payments";
import { formatAmount } from "@/lib/ar/format";

type Customer = { id: number; code: string; name: string; tdsRatePct: number };
const MODES = ["NEFT", "RTGS", "IMPS", "UPI", "Cheque"] as const;

export default function ReceiptForm({
  customers,
  openByCustomer,
  asOf,
  initialCustomerId,
}: {
  customers: Customer[];
  /** Each customer's open invoices (any date), oldest first, from lib/ar. */
  openByCustomer: Record<number, OpenInvoice[]>;
  asOf: string;
  initialCustomerId?: number;
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState(initialCustomerId ? String(initialCustomerId) : "");
  const [receiptDate, setReceiptDate] = useState(asOf);
  const [bankAmount, setBankAmount] = useState("");
  /** null = use the pre-filled expected TDS; a string = what the user typed. */
  const [tdsTyped, setTdsTyped] = useState<string | null>(null);
  const [mode, setMode] = useState<(typeof MODES)[number]>("NEFT");
  const [reference, setReference] = useState("");
  /** null = use the oldest-first suggestion; otherwise the user's own split. */
  const [amountsTyped, setAmountsTyped] = useState<Record<number, string> | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const customer = customers.find((c) => c.id === Number(customerId));
  // R6: an allocation cannot be dated before the invoice.
  const open = (customer ? openByCustomer[customer.id] ?? [] : []).filter(
    (row) => row.invoice.invoiceDate <= receiptDate
  );

  const bank = toPaise(bankAmount);
  const tdsSuggested = customer ? expectedTds(open, bank, customer.tdsRatePct) : 0;
  const tdsInput = tdsTyped ?? toInput(tdsSuggested);
  const tds = toPaise(tdsInput);
  const settlement = bank + tds;

  const suggestion = suggestAllocation(open, settlement);
  const amounts: Record<number, string> =
    amountsTyped ?? Object.fromEntries(suggestion.map((l) => [l.invoiceId, toInput(l.amount)]));
  const lines = open
    .map((row) => ({ invoiceId: row.invoice.id, amount: toPaise(amounts[row.invoice.id] ?? "") }))
    .filter((l) => l.amount > 0);
  const unapplied = unappliedAfter(bank, tds, lines);

  function changeCustomer(value: string) {
    setCustomerId(value);
    setTdsTyped(null);
    setAmountsTyped(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    const result = await createReceiptWithAllocations({
      customerId: Number(customerId),
      receiptDate,
      bankAmount: bank / 100,
      tdsAmount: tds / 100,
      mode,
      reference: reference.trim() || null,
      allocations: lines.map((l) => ({ invoiceId: l.invoiceId, amount: l.amount / 100 })),
    });
    if (!result.success) {
      setError(result.error);
      setSaving(false);
      return;
    }
    router.push(`/customers/${customerId}?asof=${encodeURIComponent(asOf)}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Customer *">
          <select
            value={customerId}
            onChange={(e) => changeCustomer(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Select customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Receipt date *">
          <input
            type="date"
            value={receiptDate}
            onChange={(e) => {
              setReceiptDate(e.target.value);
              setAmountsTyped(null);
            }}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Bank amount (₹) *">
          <input
            type="number"
            min="0"
            step="0.01"
            value={bankAmount}
            onChange={(e) => {
              setBankAmount(e.target.value);
              setAmountsTyped(null);
            }}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>
        <Field
          label={`TDS deducted (₹)${customer ? ` · expected at ${customer.tdsRatePct}%: ${formatAmount(tdsSuggested)}` : ""}`}
        >
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              value={tdsInput}
              onChange={(e) => {
                setTdsTyped(e.target.value);
                setAmountsTyped(null);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            {tdsTyped !== null && (
              <button
                type="button"
                onClick={() => setTdsTyped(null)}
                className="whitespace-nowrap rounded-lg border border-slate-300 px-3 text-xs"
              >
                Use expected
              </button>
            )}
          </div>
          <span className="mt-1 block text-xs text-slate-500">
            Pre-filled from the customer&apos;s TDS rate on the taxable value. Enter what was actually deducted.
          </span>
        </Field>
        <Field label="Mode *">
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as (typeof MODES)[number])}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {MODES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </Field>
        <Field label="Reference (UTR / cheque no.)">
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            maxLength={200}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>
      </div>

      {customer && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Allocate to open invoices</h2>
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={() => setAmountsTyped(null)}
                className="rounded border border-slate-300 px-2 py-1"
              >
                Suggest oldest first
              </button>
              <button
                type="button"
                onClick={() => setAmountsTyped({})}
                className="rounded border border-slate-300 px-2 py-1"
              >
                Clear all
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Suggested oldest first (by due date, then invoice number). Change any amount.
          </p>
          <AllocationLines
            open={open}
            amounts={amounts}
            onChange={(id, value) => setAmountsTyped({ ...amounts, [id]: value })}
          />
        </section>
      )}

      <div className="grid gap-3 rounded-lg bg-slate-50 p-4 text-sm md:grid-cols-4">
        <Stat label="Settlement (bank + TDS)" value={formatAmount(settlement)} />
        <Stat label="Allocated" value={formatAmount(settlement - unapplied)} />
        <Stat
          label="Remains unapplied credit"
          value={formatAmount(unapplied)}
          tone={unapplied < 0 ? "bad" : unapplied > 0 ? "note" : undefined}
        />
        <div className="self-end text-right">
          <button
            type="submit"
            disabled={saving || !customer || settlement <= 0 || unapplied < 0}
            className="rounded-lg bg-slate-900 px-5 py-2 font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save receipt"}
          </button>
        </div>
      </div>
      {unapplied < 0 && (
        <p className="text-sm text-red-700">The allocations add up to more than the settlement value.</p>
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

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bad" | "note" }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p
        className={`mt-1 font-semibold tabular-nums ${
          tone === "bad" ? "text-red-700" : tone === "note" ? "text-amber-700" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
