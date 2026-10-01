import Link from "next/link";

import { loadArData } from "@/lib/ar/load";
import { getAsOf } from "@/lib/asof";
import { receiptListRows } from "@/lib/ar/lists";
import { customer360 } from "@/lib/ar/collections";
import {
  AGEING_BUCKETS,
  customerPosition,
  invoicePosition,
} from "@/lib/ar/calculations";
import {
  formatAmount,
  formatDrCr,
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

  const c360 = customer360(data, customer.id, asof);
  const receipts = receiptListRows(data, asof).filter(
    (row) => row.receipt.customerId === customer.id
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

            <div className="flex flex-wrap justify-end gap-2">
              {customer.isActive && (
                <Link
                  href={`/invoices/new?asof=${asof}&customer=${customer.id}`}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
                >
                  New invoice
                </Link>
              )}
              <Link
                href={`/receipts/new?asof=${asof}&customer=${customer.id}`}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
              >
                Record payment
              </Link>
              <Link
                href={`/statement?customer=${customer.id}&asof=${asof}`}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
              >
                Statement
              </Link>
              <Link
                href={`/customers/${customer.id}/edit?asof=${asof}`}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
              >
                Edit customer
              </Link>
              <form
                action={async () => {
                  "use server";
                  const { setCustomerActive } = await import("@/app/customers/actions/customer-actions");
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
            </div>
          </div>
        </div>

        {position.overLimit && (
          <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
            Over the credit limit: net balance {formatDrCr(position.netBalance)} against a limit of{" "}
            {formatAmount(customer.creditLimit)}.
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-4">
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Net balance
            </p>

            <p className="mt-2 text-xl font-semibold">
              {formatDrCr(position.netBalance)}
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

        <section className="mt-6 rounded-xl bg-white p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Collection summary</h2>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                c360.creditStatus === "Over Limit"
                  ? "bg-red-100 text-red-800"
                  : c360.creditStatus === "Near Limit"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-green-100 text-green-800"
              }`}
              title="Workflow indicator: over limit, or 80% or more of the limit used. Not a credit-risk score."
            >
              {c360.creditStatus} · {c360.utilisationPct}% of limit used
            </span>
          </div>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="Credit limit" value={formatAmount(c360.creditLimit)} />
            <Fact label="Net balance (after unapplied)" value={formatDrCr(c360.netBalance)} strong />
            <Fact label="Invoice outstanding (gross)" value={formatAmount(c360.outstanding)} />
            <Fact label="Unapplied credit held" value={formatAmount(c360.unappliedCredit)} tone={c360.unappliedCredit > 0 ? "amber" : undefined} />
            <Fact label="Overdue" value={formatAmount(c360.overdue)} tone={c360.overdue > 0 ? "red" : undefined} />
            <Fact label="Not yet due" value={formatAmount(c360.notDue)} />
            <Fact
              label="Open / overdue invoices"
              value={`${c360.openInvoices} / ${c360.overdueInvoices}`}
              href={`/invoices?asof=${asof}&customer=${customer.id}&status=Overdue`}
            />
            <Fact
              label="Oldest overdue"
              value={
                c360.oldestOverdue
                  ? `${c360.oldestOverdue.invoice.invoiceNo} · ${c360.oldestOverdue.daysPastDue} days`
                  : "—"
              }
              href={c360.oldestOverdue ? `/invoices/${c360.oldestOverdue.invoice.id}?asof=${asof}` : undefined}
              tone={c360.oldestOverdue ? "red" : undefined}
            />
            <Fact
              label="Promises: broken / pending"
              value={`${c360.brokenPromises} / ${c360.pendingPromises}`}
              tone={c360.brokenPromises > 0 ? "red" : undefined}
            />
            <Fact
              label="Follow-ups due"
              value={String(c360.followUpsDue)}
              href={`/customers/${customer.id}/notes?asof=${asof}`}
              tone={c360.followUpsDue > 0 ? "amber" : undefined}
            />
            <Fact
              label="Last receipt"
              value={
                c360.lastReceipt
                  ? `${formatDate(c360.lastReceipt.receipt.receiptDate)} · ${formatAmount(c360.lastReceipt.settlement)}`
                  : "None"
              }
              href={c360.lastReceipt ? `/receipts/${c360.lastReceipt.receipt.id}/allocate?asof=${asof}` : undefined}
            />
            <Fact
              label="Worklist"
              value="Open in Collections →"
              href={`/collections?asof=${asof}&customer=${customer.id}&show=all`}
            />
          </dl>
          {c360.unappliedCredit > 0 && (
            <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
              {formatAmount(c360.unappliedCredit)} has been received but not matched to an invoice. It is shown on its own
              and deducted only in the net balance; ageing bands show invoice amounts only.
            </p>
          )}
        </section>

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
          <div className="flex items-center justify-between border-b px-6 py-4">
            <h2 className="font-semibold">Receipts</h2>
            {position.unappliedCredit > 0 && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                {formatAmount(position.unappliedCredit)} unapplied credit to allocate
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-6 py-3">Receipt</th>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Mode / reference</th>
                  <th className="px-6 py-3 text-right">Bank</th>
                  <th className="px-6 py-3 text-right">TDS</th>
                  <th className="px-6 py-3 text-right">Settlement</th>
                  <th className="px-6 py-3 text-right">Unapplied</th>
                  <th className="px-6 py-3 text-right" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {receipts.map((r) => (
                  <tr key={r.receipt.id}>
                    <td className="px-6 py-3 font-medium">{r.receipt.receiptNo}</td>
                    <td className="px-6 py-3">{formatDate(r.receipt.receiptDate)}</td>
                    <td className="px-6 py-3">
                      {r.receipt.mode}
                      {r.receipt.reference ? ` · ${r.receipt.reference}` : ""}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums">{formatAmount(r.receipt.bankAmount)}</td>
                    <td className="px-6 py-3 text-right tabular-nums">{formatAmount(r.receipt.tdsAmount)}</td>
                    <td className="px-6 py-3 text-right tabular-nums">{formatAmount(r.settlement)}</td>
                    <td className={`px-6 py-3 text-right tabular-nums ${r.unapplied > 0 ? "font-semibold text-amber-700" : ""}`}>
                      {formatAmount(r.unapplied)}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <Link
                        href={`/receipts/${r.receipt.id}/allocate?asof=${asof}`}
                        className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
                      >
                        {r.unapplied > 0 ? "Allocate credit" : "View / correct"}
                      </Link>
                    </td>
                  </tr>
                ))}
                {receipts.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-6 text-center text-slate-500">
                      No receipts on or before this date.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-6 rounded-xl bg-white shadow-sm">
          <div className="flex items-center justify-between border-b px-6 py-4">
            <h2 className="font-semibold">Collection activity</h2>
            <Link
              href={`/customers/${customer.id}/notes?asof=${asof}`}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              Add note / mark follow-up done
            </Link>
          </div>
          {c360.activity.length === 0 ? (
            <p className="px-6 py-6 text-sm text-slate-500">No notes on or before this date.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2">Type</th>
                    <th className="px-4 py-2">Invoice</th>
                    <th className="px-4 py-2">Note</th>
                    <th className="px-4 py-2">Promise to pay</th>
                    <th className="px-4 py-2">Follow-up</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {c360.activity.map(({ note, invoiceNo, promiseStatus, followUpState }) => (
                    <tr key={note.id} className="align-top">
                      <td className="px-4 py-3 whitespace-nowrap">{formatDate(note.noteDate)}</td>
                      <td className="px-4 py-3">{note.noteType}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {invoiceNo && note.invoiceId ? (
                          <Link href={`/invoices/${note.invoiceId}?asof=${asof}`} className="text-blue-700 hover:underline">
                            {invoiceNo}
                          </Link>
                        ) : (
                          <span className="text-slate-400">Account</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{note.body}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {promiseStatus ? (
                          <>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                promiseStatus === "Broken"
                                  ? "bg-red-100 text-red-800"
                                  : promiseStatus === "Kept"
                                    ? "bg-green-100 text-green-800"
                                    : "bg-blue-100 text-blue-800"
                              }`}
                            >
                              {promiseStatus}
                            </span>
                            <div className="mt-1 text-xs text-slate-500">
                              {formatAmount(note.promiseAmount ?? 0)} by {formatDate(note.promiseDate!)}
                            </div>
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {followUpState ? (
                          <span
                            className={
                              followUpState === "Due"
                                ? "font-medium text-amber-800"
                                : followUpState === "Done"
                                  ? "text-slate-400 line-through"
                                  : "text-slate-600"
                            }
                          >
                            {followUpState} · {formatDate(note.followUpDate!)}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Fact({
  label,
  value,
  href,
  tone,
  strong,
}: {
  label: string;
  value: string;
  href?: string;
  tone?: "red" | "amber";
  strong?: boolean;
}) {
  const color = tone === "red" ? "text-red-700" : tone === "amber" ? "text-amber-700" : "";
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`mt-0.5 tabular-nums ${strong ? "font-semibold" : "font-medium"} ${color}`}>
        {href ? (
          <Link href={href} className="hover:underline">
            {value}
          </Link>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
