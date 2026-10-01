import Link from "next/link";
import { loadArData } from "@/lib/ar/load";
import { formatAmount, formatDate } from "@/lib/ar/format";
import { getAsOf } from "@/lib/asof";
import { receiptListRows, receiptListTotals } from "@/lib/ar/lists";
import { DeleteReceiptButton } from "./components/CorrectionButtons";

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ asof?: string }>;
}) {
  const params = await searchParams;
  const asOf = getAsOf(params.asof);
  const data = await loadArData();

  const rows = receiptListRows(data, asOf);
  const totals = receiptListTotals(rows);

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Receipts</h1>
          <p className="mt-1 text-sm text-slate-500">Receipts dated on or before {formatDate(asOf)}</p>
        </div>
        <Link
          href={`/receipts/new?asof=${asOf}`}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          + Record payment
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-slate-50 text-left">
            <tr>
              <th className="px-4 py-3">Receipt</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3 text-right">Bank</th>
              <th className="px-4 py-3 text-right">TDS</th>
              <th className="px-4 py-3 text-right">Settlement</th>
              <th className="px-4 py-3 text-right">Allocated</th>
              <th className="px-4 py-3 text-right">Unapplied</th>
              <th className="px-4 py-3">Mode / reference</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.receipt.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link
                    href={`/receipts/${row.receipt.id}/allocate?asof=${asOf}`}
                    className="font-medium text-blue-700 hover:underline"
                  >
                    {row.receipt.receiptNo}
                  </Link>
                </td>
                <td className="px-4 py-3">{formatDate(row.receipt.receiptDate)}</td>
                <td className="px-4 py-3">
                  <Link href={`/customers/${row.receipt.customerId}?asof=${asOf}`} className="hover:underline">
                    {row.customerCode} — {row.customerName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{formatAmount(row.receipt.bankAmount)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatAmount(row.receipt.tdsAmount)}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatAmount(row.settlement)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatAmount(row.allocated)}</td>
                <td className={`px-4 py-3 text-right tabular-nums ${row.unapplied > 0 ? "font-semibold text-amber-700" : ""}`}>
                  {formatAmount(row.unapplied)}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {row.receipt.mode}
                  {row.receipt.reference ? ` · ${row.receipt.reference}` : ""}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-start justify-end gap-2">
                    <Link
                      href={`/receipts/${row.receipt.id}/allocate?asof=${asOf}`}
                      className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
                    >
                      {row.unapplied > 0 ? "Allocate" : "View"}
                    </Link>
                    {row.allocationCount === 0 && (
                      <DeleteReceiptButton receiptId={row.receipt.id} receiptNo={row.receipt.receiptNo} />
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-slate-500">
                  No receipts on or before this date.
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="border-t-2 bg-slate-50 font-semibold">
              <tr>
                <td className="px-4 py-3" colSpan={3}>
                  Total ({rows.length})
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{formatAmount(totals.bank)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatAmount(totals.tds)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatAmount(totals.settlement)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatAmount(totals.allocated)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatAmount(totals.unapplied)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Delete appears only for receipts with no allocations. Remove allocations from the receipt&apos;s page first.
      </p>
    </main>
  );
}
