"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  cancelInvoice,
  setDisputed,
} from "../../invoice-actions";

export default function InvoiceActions({
  invoiceId,
  invoiceNo,
  isDisputed,
  isCancelled,
  asof,
}: {
  invoiceId: number;
  invoiceNo: string;
  isDisputed: boolean;
  isCancelled: boolean;
  asof: string;
}) {
  const router = useRouter();

  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  async function toggleDisputed() {
    setError("");
    setWorking(true);

    const result = await setDisputed(
      invoiceId,
      !isDisputed
    );

    if (!result.success) {
      setError(result.error ?? "Unable to update invoice");
      setWorking(false);
      return;
    }

    router.push(
      `/invoices/${invoiceId}?asof=${encodeURIComponent(asof)}`
    );

    router.refresh();
  }

  async function handleCancel() {
    const confirmed = window.confirm(
      `Cancel invoice ${invoiceNo}? This cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    setError("");
    setWorking(true);

    const result = await cancelInvoice(invoiceId);

    if (!result.success) {
      setError(result.error ?? "Unable to cancel invoice");
      setWorking(false);
      return;
    }

    router.push(
      `/invoices/${invoiceId}?asof=${encodeURIComponent(asof)}`
    );

    router.refresh();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      {error && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold">
              Disputed Status
            </h2>

            <p className="text-sm text-slate-500">
              Current status:{" "}
              {isDisputed ? "Disputed" : "Not disputed"}
            </p>
          </div>

          {!isCancelled && (
            <button
              type="button"
              onClick={toggleDisputed}
              disabled={working}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              {isDisputed
                ? "Clear Disputed"
                : "Mark Disputed"}
            </button>
          )}
        </div>

        <div className="border-t border-slate-200 pt-5">
          <h2 className="font-semibold">
            Cancellation
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            An invoice with allocations or credit notes
            cannot be cancelled.
          </p>

          {isCancelled ? (
            <div className="mt-3 rounded-lg bg-slate-100 px-4 py-3 text-sm font-medium text-slate-700">
              This invoice is already cancelled.
            </div>
          ) : (
            <button
              type="button"
              onClick={handleCancel}
              disabled={working}
              className="mt-3 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Cancel Invoice
            </button>
          )}
        </div>
      </div>
    </div>
  );
}