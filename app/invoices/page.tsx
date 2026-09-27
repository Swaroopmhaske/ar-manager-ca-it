import Link from "next/link";
import { loadArData } from "@/lib/ar/load";
import { getAsOf } from "@/lib/asof";
import { formatAmount, formatDate } from "@/lib/ar/format";
import { invoicePosition } from "@/lib/ar/calculations";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{
    asof?: string;
    q?: string;
    status?: string;
  }>;
}) {
  const params = await searchParams;
  const asof = getAsOf(params.asof);

  const data = await loadArData();
  const positions = data.invoices
  .filter((invoice) => invoice.invoiceDate <= asof)
  .map((invoice) => invoicePosition(data, invoice, asof))
  .filter((position): position is NonNullable<typeof position> => position !== null);

  const query = (params.q ?? "").trim().toLowerCase();
  const status = params.status ?? "All";

  const filtered = positions.filter((position) => {
    const invoice = position.invoice;

    const customer = data.customers.find(
      (c) => c.id === invoice.customerId
    );

    const matchesSearch =
      !query ||
      invoice.invoiceNo.toLowerCase().includes(query) ||
      customer?.name.toLowerCase().includes(query) ||
      customer?.code.toLowerCase().includes(query);

    const matchesStatus =
      status === "All" ||
      position.status === status ||
      (status === "Cancelled" && invoice.isCancelled);

    return matchesSearch && matchesStatus;
  });

  const totalOutstanding = filtered.reduce(
    (sum, item) => sum + item.outstanding,
    0
  );

  const totalReceived = filtered.reduce(
    (sum, item) => sum + item.received,
    0
  );

  const totalCredited = filtered.reduce(
    (sum, item) => sum + item.credited,
    0
  );

  return (
    <main className="mx-auto max-w-7xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
<a
  href={`/invoices/export?asof=${asof}`}
  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
>
  Export CSV
</a>
          <h1 className="text-2xl font-bold">Invoices</h1>
          <p className="mt-1 text-sm text-slate-500">
            Invoice position as at {formatDate(asof)}
          </p>
        </div>

        <Link
          href={`/invoices/new?asof=${encodeURIComponent(asof)}`}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          + New Invoice
        </Link>
      </div>

      <form className="mb-5 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-3">
        <input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Search invoice/customer..."
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />

        <select
          name="status"
          defaultValue={status}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option>All</option>
          <option>Due</option>
          <option>Overdue</option>
          <option>Paid</option>
          <option>Cancelled</option>
        </select>

        <input type="hidden" name="asof" value={asof} />

        <button
          type="submit"
          className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600"
        >
          Apply
        </button>
      </form>

      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <SummaryCard
          label="Filtered Invoices"
          value={String(filtered.length)}
        />

        <SummaryCard
          label="Received"
          value={formatAmount(totalReceived)}
        />

        <SummaryCard
          label="Outstanding"
          value={formatAmount(totalOutstanding)}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Invoice Date</th>
              <th className="px-4 py-3">Due Date</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Received</th>
              <th className="px-4 py-3 text-right">Credited</th>
              <th className="px-4 py-3 text-right">Outstanding</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Days Late</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((position) => {
              const customer = data.customers.find(
                (c) => c.id === position.invoice.customerId
              );

              return (
                <tr
                  key={position.invoice.id}
                  className="border-b border-slate-100 hover:bg-slate-50"
                >
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/invoices/${position.invoice.id}?asof=${encodeURIComponent(asof)}`}
                      className="text-blue-600 hover:underline"
                    >
                      {position.invoice.invoiceNo}
                    </Link>

                    {position.invoice.isDisputed && (
                      <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                        Disputed
                      </span>
                    )}

                    {position.isPartPaid && (
                      <span className="ml-2 rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-800">
                        Part-paid
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    {customer?.code} — {customer?.name}
                  </td>

                  <td className="px-4 py-3">
                    {formatDate(position.invoice.invoiceDate)}
                  </td>

                  <td className="px-4 py-3">
                    {formatDate(position.invoice.dueDate)}
                  </td>

                  <td className="px-4 py-3 text-right">
                    {formatAmount(position.invoice.total)}
                  </td>

                  <td className="px-4 py-3 text-right">
                    {formatAmount(position.received)}
                  </td>

                  <td className="px-4 py-3 text-right">
                    {formatAmount(position.credited)}
                  </td>

                  <td className="px-4 py-3 text-right font-medium">
                    {formatAmount(position.outstanding)}
                  </td>

                  <td className="px-4 py-3">
                    <span
                      className={
                        position.status === "Overdue"
                          ? "font-semibold text-red-600"
                          : position.status === "Paid"
                            ? "text-green-600"
                            : "text-slate-700"
                      }
                    >
                      {position.status}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    {position.daysPastDue > 0
                      ? position.daysPastDue
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>

          <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
            <tr>
              <td colSpan={5} className="px-4 py-3">
                Totals
              </td>
              <td className="px-4 py-3 text-right">
                {formatAmount(totalReceived)}
              </td>
              <td className="px-4 py-3 text-right">
                {formatAmount(totalCredited)}
              </td>
              <td className="px-4 py-3 text-right">
                {formatAmount(totalOutstanding)}
              </td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>

        {filtered.length === 0 && (
          <div className="p-8 text-center text-sm text-slate-500">
            No invoices found.
          </div>
        )}
      </div>
    </main>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-bold">{value}</p>
    </div>
  );
}