import Link from "next/link";
import { loadArData } from "@/lib/ar/load";
import { getAsOf } from "@/lib/asof";
import {
  AGEING_BUCKETS,
  customerPosition,
  invoicePosition,
  dso,
} from "@/lib/ar/calculations";
import { formatAmount, formatDate } from "@/lib/ar/format";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ asof?: string }>;
}) {
  const params = await searchParams;
  const asof = getAsOf(params.asof);

  const data = await loadArData();

  const invoiceRows = data.invoices
    .filter((invoice) => invoice.invoiceDate <= asof)
    .map((invoice) => invoicePosition(data, invoice, asof))
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const customerRows = data.customers.map((customer) => ({
    customer,
    position: customerPosition(data, customer.id, asof),
  }));

  const totalOutstanding = invoiceRows.reduce(
    (sum, row) => sum + row.outstanding,
    0
  );

  const overdueAmount = invoiceRows
    .filter((row) => row.status === "Overdue")
    .reduce((sum, row) => sum + row.outstanding, 0);

  const overdueCount = invoiceRows.filter(
    (row) => row.status === "Overdue"
  ).length;

  const unappliedCredit = customerRows.reduce(
    (sum, row) => sum + row.position.unappliedCredit,
    0
  );

  const netReceivable = totalOutstanding - unappliedCredit;

  const overduePct =
    totalOutstanding > 0
      ? Math.round((overdueAmount / totalOutstanding) * 100)
      : 0;

  const overdueRows = invoiceRows
    .filter((row) => row.status === "Overdue")
    .sort((a, b) => {
      if (b.daysPastDue !== a.daysPastDue) {
        return b.daysPastDue - a.daysPastDue;
      }

      return a.invoice.invoiceNo.localeCompare(
        b.invoice.invoiceNo
      );
    });

  const attentionCustomers = customerRows.filter(
    ({ position }) => position.overLimit
  );

  const dsoValue = dso(data, asof);

  return (
    <main className="mx-auto max-w-7xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">
          Overdue at a Glance
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          Accounts receivable position as at {formatDate(asof)}
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Metric
          label="Outstanding"
          value={formatAmount(totalOutstanding)}
        />

        <Metric
          label="Unapplied Credit"
          value={formatAmount(unappliedCredit)}
        />

        <Metric
          label="Net Receivable"
          value={formatAmount(netReceivable)}
        />

        <Metric
          label="Overdue"
          value={formatAmount(overdueAmount)}
        />

        <Metric
          label="Overdue %"
          value={`${overduePct}%`}
        />

        <Metric
          label="DSO"
          value={`${dsoValue}`}
        />
      </section>

      <section className="mt-4 grid gap-4 md:grid-cols-2">
        <Metric
          label="Overdue Invoices"
          value={String(overdueCount)}
        />

        <Metric
          label="Customers Over Limit"
          value={String(attentionCustomers.length)}
        />
      </section>

      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">
              Ageing by Customer
            </h2>
<a
  href={`/ageing/export?asof=${asof}`}
  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
>
  Export Ageing CSV
</a>

            <p className="text-sm text-slate-500">
              Outstanding balances grouped by ageing bucket.
            </p>
          </div>

          <Link
            href={`/customers?asof=${encodeURIComponent(asof)}`}
            className="text-sm text-blue-600 hover:underline"
          >
            View customers
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-3 py-3">Customer</th>
                {AGEING_BUCKETS.map((bucket) => (
                  <th key={bucket} className="px-3 py-3 text-right">
                    {bucket}
                  </th>
                ))}
                <th className="px-3 py-3 text-right">Unapplied</th>
              </tr>
            </thead>

            <tbody>
              {customerRows.map(({ customer, position }) => (
                <tr
                  key={customer.id}
                  className="border-b border-slate-100"
                >
                  <td className="px-3 py-3">
                    <Link
                      href={`/customers/${customer.id}?asof=${encodeURIComponent(asof)}`}
                      className="text-blue-600 hover:underline"
                    >
                      {customer.code} — {customer.name}
                    </Link>
                  </td>

                  {AGEING_BUCKETS.map((bucket) => (
                    <td key={bucket} className="px-3 py-3 text-right">
                      {formatAmount(position.ageing[bucket])}
                    </td>
                  ))}

                  <td className="px-3 py-3 text-right">
                    {formatAmount(position.unappliedCredit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">
            Overdue Invoices
          </h2>

          <p className="text-sm text-slate-500">
            Longest overdue first.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-3 py-3">Invoice</th>
                <th className="px-3 py-3">Customer</th>
                <th className="px-3 py-3">Due</th>
                <th className="px-3 py-3 text-right">Days Late</th>
                <th className="px-3 py-3 text-right">
                  Outstanding
                </th>
                <th className="px-3 py-3">Labels</th>
              </tr>
            </thead>

            <tbody>
              {overdueRows.map((row) => {
                const customer = data.customers.find(
                  (item) =>
                    item.id === row.invoice.customerId
                );

                return (
                  <tr
                    key={row.invoice.id}
                    className="border-b border-red-100 bg-red-50"
                  >
                    <td className="px-3 py-3 font-medium">
                      <Link
                        href={`/invoices/${row.invoice.id}?asof=${encodeURIComponent(asof)}`}
                        className="text-blue-700 hover:underline"
                      >
                        {row.invoice.invoiceNo}
                      </Link>
                    </td>

                    <td className="px-3 py-3">
                      {customer?.code} — {customer?.name}
                    </td>

                    <td className="px-3 py-3">
                      {formatDate(row.invoice.dueDate)}
                    </td>

                    <td className="px-3 py-3 text-right font-semibold text-red-700">
                      {row.daysPastDue}
                    </td>

                    <td className="px-3 py-3 text-right font-semibold">
                      {formatAmount(row.outstanding)}
                    </td>

                    <td className="px-3 py-3">
                      <div className="flex gap-1">
                        {row.isPartPaid && (
                          <span className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-800">
                            Part-paid
                          </span>
                        )}

                        {row.invoice.isDisputed && (
                          <span className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-800">
                            Disputed
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {overdueRows.length === 0 && (
            <p className="p-6 text-center text-sm text-slate-500">
              No overdue invoices.
            </p>
          )}
        </div>
      </section>

      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold">
          Needs Attention
        </h2>

        <div className="mt-4 space-y-3">
          {attentionCustomers.length === 0 ? (
            <p className="text-sm text-slate-500">
              No customers are currently over their credit
              limit.
            </p>
          ) : (
            attentionCustomers.map(
              ({ customer, position }) => (
                <Link
                  key={customer.id}
                  href={`/customers/${customer.id}?asof=${encodeURIComponent(asof)}`}
                  className="block rounded-lg border border-amber-200 bg-amber-50 p-4 hover:bg-amber-100"
                >
                  <div className="font-medium">
                    {customer.code} — {customer.name}
                  </div>

                  <div className="mt-1 text-sm text-amber-800">
                    Net balance {formatAmount(position.netBalance)}
                    {" "}is above credit limit{" "}
                    {formatAmount(customer.creditLimit)}
                  </div>
                </Link>
              )
            )
          )}
        </div>
      </section>
    </main>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-bold text-slate-900">
        {value}
      </p>
    </div>
  );
}