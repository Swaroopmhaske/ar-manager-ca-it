import Link from "next/link";
import { loadArData } from "@/lib/ar/load";
import { getAsOf } from "@/lib/asof";
import { AGEING_BUCKETS, customerPositions } from "@/lib/ar/calculations";
import { dashboardSummary, needsAttention, overdueInvoices } from "@/lib/ar/attention";
import { formatAmount, formatDate, formatDrCr } from "@/lib/ar/format";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ asof?: string }> }) {
  const params = await searchParams;
  const asof = getAsOf(params.asof);
  const data = await loadArData();

  const summary = dashboardSummary(data, asof);
  const attention = needsAttention(data, asof);
  const overdue = overdueInvoices(data, asof);
  const customers = new Map(data.customers.map((c) => [c.id, c]));
  const ageingRows = customerPositions(data, asof).filter((p) => p.outstanding !== 0 || p.unappliedCredit !== 0);
  const q = `asof=${encodeURIComponent(asof)}`;

  return (
    <main className="mx-auto max-w-[90rem] p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Overdue at a glance</h1>
          <p className="mt-1 text-sm text-slate-500">As at {formatDate(asof)}</p>
        </div>
        <a href={`/ageing/export?${q}`} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50">
          Export ageing CSV
        </a>
      </div>

      <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <Card label="Outstanding on invoices" value={formatAmount(summary.totalOutstanding)} />
        <Card label="Unapplied credit" value={formatAmount(summary.unappliedCredit)} />
        <Card label="Net receivable" value={formatDrCr(summary.netReceivable)} />
        <Card
          label="Overdue"
          value={formatAmount(summary.overdue)}
          note={`${summary.overduePct}% of outstanding`}
          tone="red"
        />
        <Card label="DSO" value={summary.dso === null ? "—" : `${summary.dso} days`} note="90-day window" />
        <Card label="Overdue invoices" value={String(summary.overdueInvoiceCount)} tone="red" />
      </section>

      <section className="mb-8 rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-lg font-semibold">Ageing by customer</h2>
          <span className="text-xs text-slate-500">Days past due from the due date · click a row for its invoices</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-3 text-left">Customer</th>
                {AGEING_BUCKETS.map((b) => (
                  <th key={b} className="px-3 py-3 text-right">
                    {b}
                  </th>
                ))}
                <th className="px-3 py-3 text-right">Outstanding</th>
                <th className="px-3 py-3 text-right">Unapplied</th>
                <th className="px-3 py-3 text-right">Net balance</th>
              </tr>
            </thead>
            <tbody>
              {ageingRows.map((p) => {
                const c = customers.get(p.customerId)!;
                return (
                  <tr key={p.customerId} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/invoices?${q}&customer=${c.id}`}
                        className="text-blue-700 hover:underline"
                        title="This customer's invoices"
                      >
                        {c.code} — {c.name}
                      </Link>
                    </td>
                    {AGEING_BUCKETS.map((b) => (
                      <td key={b} className={`px-3 py-2.5 text-right tabular-nums ${p.ageing[b] === 0 ? "text-slate-300" : ""}`}>
                        {formatAmount(p.ageing[b])}
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums">{formatAmount(p.outstanding)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatAmount(p.unappliedCredit)}</td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums">{formatDrCr(p.netBalance)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
              <tr>
                <td className="px-3 py-3">Total</td>
                {AGEING_BUCKETS.map((b) => (
                  <td key={b} className="px-3 py-3 text-right tabular-nums">
                    {formatAmount(summary.ageing[b])}
                  </td>
                ))}
                <td className="px-3 py-3 text-right tabular-nums">{formatAmount(summary.totalOutstanding)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatAmount(summary.unappliedCredit)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatDrCr(summary.netReceivable)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
          <h2 className="border-b px-5 py-4 text-lg font-semibold">Overdue invoices</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-3">Invoice</th>
                  <th className="px-3 py-3">Customer</th>
                  <th className="px-3 py-3">Due date</th>
                  <th className="px-3 py-3 text-right">Days late</th>
                  <th className="px-3 py-3 text-right">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {overdue.map((p) => {
                  const c = customers.get(p.invoice.customerId);
                  return (
                    <tr key={p.invoice.id} className="border-t border-red-100 bg-red-50 text-red-900">
                      <td className="px-3 py-2.5">
                        <Link href={`/invoices/${p.invoice.id}?${q}`} className="font-medium hover:underline">
                          {p.invoice.invoiceNo}
                        </Link>
                        {p.invoice.isDisputed && (
                          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Disputed</span>
                        )}
                        {p.isPartPaid && (
                          <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">Part-paid</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">{c?.name}</td>
                      <td className="px-3 py-2.5">{formatDate(p.invoice.dueDate)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{p.daysPastDue}</td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatAmount(p.outstanding)}</td>
                    </tr>
                  );
                })}
                {overdue.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                      No overdue invoices.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Needs attention</h2>

          <Group title="Over credit limit" count={attention.overLimit.length}>
            {attention.overLimit.map(({ customer, position }) => (
              <Item key={customer.id} href={`/customers/${customer.id}?${q}`} title={customer.name}>
                Net {formatDrCr(position.netBalance)} vs limit {formatAmount(customer.creditLimit)}
              </Item>
            ))}
          </Group>

          <Group title="Broken promises" count={attention.brokenPromises.length}>
            {attention.brokenPromises.map(({ customer, note }) => (
              <Item key={note.id} href={`/customers/${customer.id}?${q}`} title={customer.name}>
                Promised {formatAmount(note.promiseAmount ?? 0)} by {formatDate(note.promiseDate!)} (noted{" "}
                {formatDate(note.noteDate)})
              </Item>
            ))}
          </Group>

          <Group title="Follow-ups due" count={attention.followUpsDue.length}>
            {attention.followUpsDue.map(({ customer, note }) => (
              <Item key={note.id} href={`/customers/${customer.id}/notes?${q}`} title={customer.name}>
                Due {formatDate(note.followUpDate!)} · {note.noteType}: {note.body.slice(0, 70)}
                {note.body.length > 70 ? "…" : ""}
              </Item>
            ))}
          </Group>

          <Group title="Unapplied credit to allocate" count={attention.unappliedCredit.length}>
            {attention.unappliedCredit.map(({ customer, position }) => (
              <Item key={customer.id} href={`/customers/${customer.id}?${q}`} title={customer.name}>
                {formatAmount(position.unappliedCredit)} received but not allocated
              </Item>
            ))}
          </Group>
        </section>
      </div>
    </main>
  );
}

function Card({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "red" }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${tone === "red" ? "text-red-700" : ""}`}>{value}</p>
      {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
    </div>
  );
}

function Group({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="mb-5 last:mb-0">
      <h3 className="mb-2 flex items-center justify-between text-sm font-semibold">
        {title}
        <span className={`rounded-full px-2 text-xs ${count > 0 ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-500"}`}>
          {count}
        </span>
      </h3>
      {count === 0 ? <p className="text-xs text-slate-400">None</p> : <ul className="space-y-2">{children}</ul>}
    </div>
  );
}

function Item({ href, title, children }: { href: string; title: string; children: React.ReactNode }) {
  return (
    <li className="rounded-lg border border-slate-100 p-2.5 text-sm">
      <Link href={href} className="font-medium text-blue-700 hover:underline">
        {title}
      </Link>
      <p className="mt-0.5 text-xs text-slate-600">{children}</p>
    </li>
  );
}
