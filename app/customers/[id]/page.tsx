import Link from "next/link";

import { loadArData } from "@/lib/ar/load";
import { getAsOf } from "@/lib/asof";
import {
  AGEING_BUCKETS,
  customerPosition,
  invoicePosition,
} from "@/lib/ar/calculations";
import {
  formatAmount,
  formatBalance,
  formatDate,
} from "@/lib/ar/format";

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ asof?: string }>;
}) {
  const routeParams = await params;
  const queryParams = await searchParams;

  const customerId = Number(routeParams.id);
  const asof = getAsOf(queryParams.asof);

  const data = await loadArData();

  const customer = data.customers.find(
    (item) => item.id === customerId
  );

  if (!customer) {
    return (
      <main className="min-h-screen p-8">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-2xl font-bold">
            Customer not found
          </h1>

          <Link
            href={`/customers?asof=${asof}`}
            className="mt-4 inline-block text-blue-700 hover:underline"
          >
            Back to customers
          </Link>
        </div>
      </main>
    );
  }

  const position = customerPosition(
  data,
  customer.id,
  asof
);

  const invoices = data.invoices
    .filter(
      (invoice) =>
        invoice.customerId === customer.id &&
        invoice.invoiceDate <= asof
    )
    .map((invoice) => ({
      invoice,
      position: invoicePosition(
        data,
        invoice,
        asof
      ),
    }));

  const receipts = data.receipts.filter(
    (receipt) =>
      receipt.customerId === customer.id &&
      receipt.receiptDate <= asof
  );

  const notes = data.notes
    .filter(
      (note) =>
        note.customerId === customer.id &&
        note.noteDate <= asof
    )
    .sort((a, b) =>
      b.noteDate.localeCompare(a.noteDate)
    );

  const ageingRows = AGEING_BUCKETS.map(
    (bucket) => [bucket, position.ageing[bucket]] as const
  );

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <Link
            href={`/customers?asof=${asof}`}
            className="text-sm text-blue-700 hover:underline"
          >
            ← Customers
          </Link>

          <div className="mt-3 flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold">
                {customer.name}
              </h1>

              <p className="mt-1 text-sm text-slate-500">
                {customer.code} · As at{" "}
                {formatDate(asof)}
              </p>
            </div>

            <Link
              href={`/customers/${customer.id}/edit?asof=${asof}`}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Edit customer<form
  action={async () => {
    "use server";

    const { setCustomerActive } = await import(
      "@/app/customers/actions/customer-actions"
    );

    await setCustomerActive(customer.id, !customer.isActive);
  }}
>
  <button
    type="submit"
    className={`rounded-lg px-4 py-2 text-sm font-medium ${
      customer.isActive
        ? "border border-red-300 text-red-700 hover:bg-red-50"
        : "bg-green-600 text-white hover:bg-green-700"
    }`}
  >
    {customer.isActive ? "Deactivate" : "Reactivate"}
  </button>
</form>
            </Link>
          </div>
        </div>

        {position.overLimit && (
          <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
            This customer is over the credit limit.
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-4">
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Net balance
            </p>

            <p className="mt-2 text-xl font-semibold">
              {formatBalance(
                Math.abs(position.netBalance),
                position.netBalance >= 0
                  ? "Dr"
                  : "Cr"
              )}
            </p>
          </div>

          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Outstanding
            </p>

            <p className="mt-2 text-xl font-semibold">
              {formatAmount(
                position.outstanding
              )}
            </p>
          </div>

          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Overdue
            </p>

            <p className="mt-2 text-xl font-semibold text-red-700">
              {formatAmount(position.overdue)}
            </p>
          </div>

          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Unapplied credit
            </p>

            <p className="mt-2 text-xl font-semibold text-emerald-700">
              {formatAmount(
                position.unappliedCredit
              )}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="rounded-xl bg-white p-6 shadow-sm lg:col-span-2">
            <h2 className="font-semibold">
              Customer profile
            </h2>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-slate-500">
                  Contact
                </p>
                <p>{customer.contactPerson ?? "—"}</p>
              </div>

              <div>
                <p className="text-xs text-slate-500">
                  Email
                </p>
                <p>{customer.email ?? "—"}</p>
              </div>

              <div>
                <p className="text-xs text-slate-500">
                  Phone
                </p>
                <p>{customer.phone ?? "—"}</p>
              </div>

              <div>
                <p className="text-xs text-slate-500">
                  GSTIN
                </p>
                <p>{customer.gstin ?? "—"}</p>
              </div>

              <div>
                <p className="text-xs text-slate-500">
                  Credit days
                </p>
                <p>{customer.creditDays}</p>
              </div>

              <div>
                <p className="text-xs text-slate-500">
                  Credit limit
                </p>
                <p>
                  {formatAmount(
                    customer.creditLimit
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="font-semibold">
              Ageing
            </h2>

            <div className="mt-4 space-y-3">
              {ageingRows.map(
                ([label, amount]) => (
                  <div
                    key={label}
                    className="flex justify-between text-sm"
                  >
                    <span className="text-slate-600">
                      {label}
                    </span>

                    <span className="font-medium">
                      {formatAmount(amount)}
                    </span>
                  </div>
                )
              )}
            </div>
          </div>
        </div>

        <section className="mt-6 rounded-xl bg-white shadow-sm">
          <div className="border-b px-6 py-4">
            <h2 className="font-semibold">
              Invoices
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-6 py-3">
                    Invoice
                  </th>
                  <th className="px-6 py-3">
                    Date
                  </th>
                  <th className="px-6 py-3">
                    Due
                  </th>
                  <th className="px-6 py-3 text-right">
                    Total
                  </th>
                  <th className="px-6 py-3 text-right">
                    Outstanding
                  </th>
                  <th className="px-6 py-3">
                    Status
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {invoices.map(
                  ({ invoice, position }) => (
                    <tr key={invoice.id}>
                      <td className="px-6 py-3 font-medium">
                        {invoice.invoiceNo}
                      </td>

                      <td className="px-6 py-3">
                        {formatDate(
                          invoice.invoiceDate
                        )}
                      </td>

                      <td className="px-6 py-3">
                        {formatDate(
                          invoice.dueDate
                        )}
                      </td>

                      <td className="px-6 py-3 text-right">
                        {formatAmount(
                          invoice.total
                        )}
                      </td>

                      <td className="px-6 py-3 text-right">
                        {formatAmount(
                          position?.outstanding ?? 0
                        )}
                      </td>

                      <td className="px-6 py-3">
                        {position?.status}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-6 rounded-xl bg-white shadow-sm">
          <div className="border-b px-6 py-4">
            <h2 className="font-semibold">
              Receipts
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-6 py-3">
                    Date
                  </th>
                  <th className="px-6 py-3">
                    Mode
                  </th>
                  <th className="px-6 py-3">
                    Reference
                  </th>
                  <th className="px-6 py-3 text-right">
                    Bank
                  </th>
                  <th className="px-6 py-3 text-right">
                    TDS
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {receipts.map((receipt) => (
                  <tr key={receipt.id}>
                    <td className="px-6 py-3">
                      {formatDate(
                        receipt.receiptDate
                      )}
                    </td>

                    <td className="px-6 py-3">
                      {receipt.mode}
                    </td>

                    <td className="px-6 py-3">
                      {receipt.reference}
                    </td>

                    <td className="px-6 py-3 text-right">
                      {formatAmount(
                        receipt.bankAmount
                      )}
                    </td>

                    <td className="px-6 py-3 text-right">
                      {formatAmount(
                        receipt.tdsAmount
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {position.unappliedCredit > 0 && (
            <div className="border-t px-6 py-4 text-sm">
              <span className="font-medium">
                Unapplied credit:
              </span>{" "}
              {formatAmount(
                position.unappliedCredit
              )}
            </div>
          )}
        </section>

        <section className="mt-6 rounded-xl bg-white shadow-sm">
          <div className="flex items-center justify-between">
  <h2 className="text-lg font-semibold">Notes & follow-ups</h2>
<Link
  href={`/customers/${customer.id}/notes?asof=${asof}`}
  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
>
  Add / View Notes
</Link>
<Link
  href={`/statement?customer=${customer.id}&from=2026-04-01&to=${asof}`}
  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
>
  Statement
</Link>

  
</div>

          <div className="divide-y">
            {notes.map((note) => (
              <div
                key={note.id}
                className="px-6 py-4"
              >
                <div className="flex justify-between">
                  <span className="font-medium">
                    {formatDate(note.noteDate)}
                  </span>

                  <span className="text-sm text-slate-500">
                    {note.noteType}
                  </span>
                </div>

                <p className="mt-2 text-sm text-slate-700">
                  {note.body}
                </p>
              </div>
            ))}

            {notes.length === 0 && (
              <p className="px-6 py-6 text-sm text-slate-500">
                No notes as at this date.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
