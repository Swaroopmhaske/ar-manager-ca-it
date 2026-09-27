import Link from "next/link";
import { notFound } from "next/navigation";
import { loadArData } from "@/lib/ar/load";
import { statement } from "@/lib/ar/calculations";
import { formatAmount, formatDate } from "@/lib/ar/format";

export default async function StatementPage({
  searchParams,
}: {
  searchParams: Promise<{
    customer?: string;
    from?: string;
    to?: string;
    asof?: string;
  }>;
}) {
  const params = await searchParams;

  const customerId = Number(params.customer);
  const from = params.from ?? "2026-04-01";
  const to = params.to ?? params.asof ?? "2026-08-31";

  if (!Number.isInteger(customerId)) {
    notFound();
  }

  const data = await loadArData();

  const customer = data.customers.find(
    (item) => item.id === customerId,
  );

  if (!customer) {
    notFound();
  }

  const result = statement(
    data,
    customerId,
    from,
    to,
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Statement of Account
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            {customer.code} — {customer.name}
          </p>

          <p className="text-sm text-slate-500">
            {formatDate(from)} to {formatDate(to)}
          </p>
        </div>

        <Link
          href={`/customers/${customerId}?asof=${to}`}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium"
        >
          Back to Customer
<div className="flex gap-2">
  <a
    href={`/statement/export?customer=${customerId}&from=${from}&to=${to}`}
    className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
  >
    Export CSV
  </a>

  <a
    href={`/statement?customer=${customerId}&from=${from}&to=${to}&print=1`}
    className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium"
  >
    Print
  </a>
</div>
        </Link>
      </div>

      <section className="mb-6 rounded-xl border bg-white p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs text-slate-500">
              Opening balance
            </p>
            <p className="mt-1 text-lg font-semibold">
              {formatAmount(result.openingBalance)}
            </p>
          </div>

          <div>
            <p className="text-xs text-slate-500">
              Closing balance
            </p>
            <p className="mt-1 text-lg font-semibold">
              {formatAmount(result.closingBalance)}
            </p>
          </div>

          <div>
            <p className="text-xs text-slate-500">
              Transactions
            </p>
            <p className="mt-1 text-lg font-semibold">
              {result.lines.length}
            </p>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-left">
                Particulars
              </th>
              <th className="px-4 py-3 text-right">Debit</th>
              <th className="px-4 py-3 text-right">Credit</th>
              <th className="px-4 py-3 text-right">
                Balance
              </th>
            </tr>
          </thead>

          <tbody className="divide-y">
            {result.lines.map((line) => (
             <tr key={`${line.date}-${line.documentNo}-${line.type}`}>
                <td className="px-4 py-3">
                  {formatDate(line.date)}
                </td>

                <td className="px-4 py-3">
                  {line.type} — {line.documentNo}
                </td>

                <td className="px-4 py-3 text-right">
                  {line.debit > 0
                    ? formatAmount(line.debit)
                    : "—"}
                </td>

                <td className="px-4 py-3 text-right">
                  {line.credit > 0
                    ? formatAmount(line.credit)
                    : "—"}
                </td>

                <td className="px-4 py-3 text-right font-medium">
                  {formatAmount(line.balance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}