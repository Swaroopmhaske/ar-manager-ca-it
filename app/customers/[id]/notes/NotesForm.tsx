"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createNote } from "../../actions";

type Invoice = {
  id: number;
  invoiceNo: string;
};

export default function NotesForm({
  customerId,
  invoices,
  asOf,
}: {
  customerId: number;
  invoices: Invoice[];
  asOf: string;
}) {
  const router = useRouter();

  const [invoiceId, setInvoiceId] = useState("");
  const [noteDate, setNoteDate] = useState(asOf);
  const [noteType, setNoteType] = useState<
    "Call" | "Email" | "Meeting" | "Note"
  >("Call");
  const [body, setBody] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [promiseDate, setPromiseDate] = useState("");
  const [promiseAmount, setPromiseAmount] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);

    try {
      const result = await createNote({
        customerId,
        invoiceId: invoiceId ? Number(invoiceId) : null,
        noteDate,
        noteType,
        body,
        followUpDate: followUpDate || null,
        followUpDone: false,
        promiseDate: promiseDate || null,
        promiseAmount: promiseAmount
          ? Number(promiseAmount)
          : null,
      });

      if (!result.success) {
        setError(result.error ?? "Unable to save note.");
        return;
      }

      router.refresh();

      setBody("");
      setFollowUpDate("");
      setPromiseDate("");
      setPromiseAmount("");
      setInvoiceId("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to save note.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-5 rounded-xl border bg-white p-6"
    >
      <h2 className="font-semibold">Add note</h2>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium">
            Note date
          </label>

          <input
            required
            type="date"
            value={noteDate}
            onChange={(e) => setNoteDate(e.target.value)}
            className="w-full rounded-lg border px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">
            Type
          </label>

          <select
            value={noteType}
            onChange={(e) =>
              setNoteType(
                e.target.value as
                  | "Call"
                  | "Email"
                  | "Meeting"
                  | "Note",
              )
            }
            className="w-full rounded-lg border px-3 py-2"
          >
            <option value="Call">Call</option>
            <option value="Email">Email</option>
            <option value="Meeting">Meeting</option>
            <option value="Note">Note</option>
          </select>
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">
          Invoice
        </label>

        <select
          value={invoiceId}
          onChange={(e) => setInvoiceId(e.target.value)}
          className="w-full rounded-lg border px-3 py-2"
        >
          <option value="">Customer-level note</option>

          {invoices.map((invoice) => (
            <option key={invoice.id} value={invoice.id}>
              {invoice.invoiceNo}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">
          Note
        </label>

        <textarea
          required
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Enter call, email, meeting or collection notes..."
          className="w-full rounded-lg border px-3 py-2"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">
          Follow-up date
        </label>

        <input
          type="date"
          min={noteDate}
          value={followUpDate}
          onChange={(e) => setFollowUpDate(e.target.value)}
          className="w-full rounded-lg border px-3 py-2"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium">
            Promise date
          </label>

          <input
            type="date"
            value={promiseDate}
            onChange={(e) => setPromiseDate(e.target.value)}
            className="w-full rounded-lg border px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">
            Promise amount (₹)
          </label>

          <input
            min="0"
            step="0.01"
            type="number"
            value={promiseAmount}
            onChange={(e) => setPromiseAmount(e.target.value)}
            className="w-full rounded-lg border px-3 py-2"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Note"}
        </button>
      </div>
    </form>
  );
}