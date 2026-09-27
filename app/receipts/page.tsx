import Link from "next/link";
import { loadArData } from "@/lib/ar/load";
import { formatAmount, formatDate } from "@/lib/ar/format";
import { getAsOf } from "@/lib/asof";
import { settlementValue } from "@/lib/ar/date";

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ asof?: string }>;
}) {
  const params = await searchParams;
  const asOf = getAsOf(params.asof);
  const data = await loadArData();

  const customers = new Map(
    data.customers.map((customer) => [customer.id, customer]),
  );

  const receipts = data.receipts
    .filter((receipt) => receipt.receiptDate <= asOf)
    .sort((a, b) => b.receiptDate.localeCompare(a.receiptDate));

  const totalBank = receipts.reduce(
    (sum, receipt) => sum + receipt.bankAmount,
    0,
  );

  const totalTds = receipts.reduce(
    (sum, receipt) => sum + receipt.tdsAmount,
    0,
  );

  const totalSettlement = totalBank + totalTds;

  const receiptAllocations = new Map<number, number>();

  for (const allocation of data.allocations) {
    if (allocation.allocationDate > asOf) continue;

    receiptAllocations.set(
      allocation.receiptId,
      (receiptAllocations.get(allocation.receiptId) ?? 0) +
        allocation.amount,
    );
  }

  const totalAllocated = receipts.reduce(
    (sum, receipt) =>
      sum + (receiptAllocations.get(receipt.id) ?? 0),
    0,
  );

  const totalUnapplied = totalSettlement - totalAllocated;

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Receipts</h1>
          <p className="mt-1 text-sm text-slate-500">
            Customer receipts and TDS settlements as of{" "}
            {formatDate(asOf)}
          </p>
        </div>

        <Link
          href={`/receipts/new?asof=${asOf}`}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          + Record Receipt
        </Link>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-slate-500">Bank receipts</p>
          <p className="mt-2 text-2xl font-bold">
            {formatAmount(totalBank)}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-slate-500">TDS</p>
          <p className="mt-2 text-2xl font-bold">
            {formatAmount(totalTds)}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-slate-500">Total settlement</p>
          <p className="mt-2 text-2xl font-bold">
            {formatAmount(totalSettlement)}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-slate-500">Unapplied credit</p>
          <p className="mt-2 text-2xl font-bold">
            {formatAmount(totalUnapplied)}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Bank amount</th>
                <th className="px-4 py-3 font-semibold">TDS</th>
                <th className="px-4 py-3 font-semibold">Settlement</th>
                <th className="px-4 py-3 font-semibold">Allocated</th>
                <th className="px-4 py-3 font-semibold">Unapplied</th>
                <th className="px-4 py-3 font-semibold">Reference</th>
                <th className="px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {receipts.map((receipt) => {
                const customer = customers.get(receipt.customerId);
                const settlement = settlementValue(
                  receipt.bankAmount,
                  receipt.tdsAmount,
                );

                const allocated =
                  receiptAllocations.get(receipt.id) ?? 0;

                const unapplied = settlement - allocated;

                return (
                  <tr key={receipt.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      {formatDate(receipt.receiptDate)}
                    </td>

                    <td className="px-4 py-3">
                      <Link
                        href={`/customers/${receipt.customerId}?asof=${asOf}`}
                        className="font-medium text-blue-700 hover:underline"
                      >
                        {customer?.code} — {customer?.name}
                      </Link>
                    </td>

                    <td className="px-4 py-3">
                      {formatAmount(receipt.bankAmount)}
                    </td>

                    <td className="px-4 py-3">
                      {formatAmount(receipt.tdsAmount)}
                    </td>

                    <td className="px-4 py-3 font-semibold">
                      {formatAmount(settlement)}
                    </td>

                    <td className="px-4 py-3">
                      {formatAmount(allocated)}
                    </td>

                    <td className="px-4 py-3 font-semibold">
                      {formatAmount(unapplied)}
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {receipt.reference ?? "—"}
                    </td>

                    <td className="px-4 py-3">
                      {unapplied > 0 ? (
                        <Link
                          href={`/receipts/${receipt.id}/allocate?asof=${asOf}`}
                          className="font-medium text-blue-700 hover:underline"
                        >
                          Allocate
                        </Link>
                      ) : (
                        <span className="text-slate-400">
                          Fully allocated
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {receipts.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-10 text-center text-slate-500"
                  >
                    No receipts found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}