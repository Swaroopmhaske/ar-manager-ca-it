"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteReceipt, removeAllocation } from "../actions";

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(confirmText: string, action: () => Promise<{ success: boolean; error?: string }>) {
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    setError("");
    const result = await action();
    setBusy(false);
    if (!result.success) setError(result.error ?? "That did not work.");
    else router.refresh();
  }
  return { busy, error, run };
}

export function RemoveAllocationButton({ allocationId, label }: { allocationId: number; label: string }) {
  const { busy, error, run } = useAction();
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          run(`Remove the allocation of ${label}? The amount goes back to the receipt as unapplied credit.`, () =>
            removeAllocation(allocationId)
          )
        }
        className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50 print:hidden"
      >
        {busy ? "Removing..." : "Remove"}
      </button>
      {error && <span className="mt-1 text-xs text-red-700">{error}</span>}
    </span>
  );
}

export function DeleteReceiptButton({ receiptId, receiptNo }: { receiptId: number; receiptNo: string }) {
  const { busy, error, run } = useAction();
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={busy}
        onClick={() => run(`Delete receipt ${receiptNo}? This cannot be undone.`, () => deleteReceipt(receiptId))}
        className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50 print:hidden"
      >
        {busy ? "Deleting..." : "Delete"}
      </button>
      {error && <span className="mt-1 text-xs text-red-700">{error}</span>}
    </span>
  );
}
