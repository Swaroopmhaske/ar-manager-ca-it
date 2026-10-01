import Link from "next/link";
import { loadArData } from "@/lib/ar/load";
import { getAsOf } from "@/lib/asof";
import { AGEING_BUCKETS } from "@/lib/ar/calculations";
import { dashboardSummary } from "@/lib/ar/attention";
import { receiptListRows } from "@/lib/ar/lists";
import {
  ATTENTION_LEVELS,
  CREDIT_STATUSES,
  WORKLIST_SORTS,
  collectionItems,
  collectionKpis,
  customerCreditRows,
  filterWorklist,
  sortWorklist,
  worklistFilterFromParams,
  type Attention,
  type CreditStatus,
  type WorklistSort,
} from "@/lib/ar/collections";
import { formatAmount, formatDate, formatDrCr } from "@/lib/ar/format";

type Search = Record<string, string | undefined>;

export default async function CollectionsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const asof = getAsOf(params.asof);
  const data = await loadArData();

  const filter = worklistFilterFromParams(params);
  const sort: WorklistSort = WORKLIST_SORTS.includes(params.sort as WorklistSort) ? (params.sort as WorklistSort) : "priority";
  const allItems = collectionItems(data, asof);
  const items = sortWorklist(filterWorklist(allItems, filter), sort);
  const kpi = collectionKpis(data, asof);
  const ageing = dashboardSummary(data, asof).ageing;
  const credit = customerCreditRows(data, asof);
  const unappliedReceipts = receiptListRows(data, asof).filter((r) => r.unapplied > 0);
  const counts = Object.fromEntries(
    ATTENTION_LEVELS.map((l) => [l, filterWorklist(allItems, { ...filter, attention: l }).length])
  ) as Record<Attention, number>;

  /** Link to this page with some parameters changed (others kept). */
  const link = (changes: Record<string, string | null>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, asof, ...changes })) if (v) q.set(k, v);
    return `/collections?${q.toString()}`;
  };
  const exportHref = `/collections/export?${new URLSearchParams(
    Object.entries({ ...params, asof }).filter((e): e is [string, string] => !!e[1])
  ).toString()}`;
  const customers = [...data.customers].sort((a, b) => a.code.localeCompare(b.code));

  return (
    <main className="mx-auto max-w-[96rem] p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Collections workbench</h1>
          <p className="mt-1 text-sm text-slate-500">
            What needs chasing as at {formatDate(asof)}, most urgent first. Priority rules are in the README.
          </p>
        </div>
        <a href={exportHref} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50">
          Export worklist CSV
        </a>
      </div>

      {/* KPIs */}
      <section className="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-9">
        <Kpi label="Total receivables" value={formatAmount(kpi.totalReceivables)} note="invoice outstanding" />
        <Kpi label="Overdue" value={formatAmount(kpi.overdue)} note={`${kpi.overduePct}% of receivables`} tone="red" />
        <Kpi label="Unapplied credit" value={formatAmount(kpi.unappliedCredit)} note="to allocate" tone={kpi.unappliedCredit > 0 ? "amber" : undefined} />
        <Kpi label="Net receivable" value={formatDrCr(kpi.netReceivable)} />
        <Kpi label="Over limit" value={String(kpi.customersOverLimit)} note="customers" tone={kpi.customersOverLimit ? "red" : undefined} href={link({ credit: "Over Limit" })} />
        <Kpi label="Near limit" value={String(kpi.customersNearLimit)} note="≥ 80% used" tone={kpi.customersNearLimit ? "amber" : undefined} href={link({ credit: "Near Limit" })} />
        <Kpi label="Broken promises" value={String(kpi.brokenPromises)} tone={kpi.brokenPromises ? "red" : undefined} href={link({ promise: "Broken" })} />
        <Kpi label="Follow-ups due" value={String(kpi.followUpsDue)} tone={kpi.followUpsDue ? "amber" : undefined} href={link({ followup: "due" })} />
        <Kpi label="DSO" value={kpi.dso === null ? "—" : `${kpi.dso} days`} note="R17, 90-day window" />
      </section>

      {/* Ageing strip */}
      <section className="mb-6 rounded-xl border bg-white p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <h2 className="font-semibold">Ageing (days past due date) — click a band to filter the worklist</h2>
          {filter.bucket && (
            <Link href={link({ bucket: null })} className="text-blue-700 hover:underline">
              Clear band
            </Link>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
          {AGEING_BUCKETS.map((b) => (
            <Link
              key={b}
              href={link({ bucket: b, show: b === "Not due" ? "all" : params.show ?? null })}
              className={`rounded-lg border p-3 hover:border-slate-400 ${
                filter.bucket === b ? "border-slate-900 bg-slate-50" : "border-slate-200"
              }`}
            >
              <p className="text-xs text-slate-500">{b}</p>
              <p className={`font-semibold tabular-nums ${b === "Over 90" && ageing[b] > 0 ? "text-red-700" : ""}`}>
                {formatAmount(ageing[b])}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* Worklist */}
      <section className="mb-8 rounded-xl border bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <h2 className="mr-2 font-semibold">Worklist</h2>
          {ATTENTION_LEVELS.map((l) => (
            <Link
              key={l}
              href={link({ attention: filter.attention === l ? null : l })}
              className={`rounded-full px-3 py-1 text-xs font-medium ${ATTN[l]} ${filter.attention === l ? "ring-2 ring-slate-900" : ""}`}
            >
              {l} · {counts[l]}
            </Link>
          ))}
          <span className="ml-auto text-xs text-slate-500">
            {items.length} invoice{items.length === 1 ? "" : "s"} ·{" "}
            {formatAmount(items.reduce((s, it) => s + it.position.outstanding, 0))} outstanding
          </span>
        </div>

        <form method="get" className="grid gap-2 border-b bg-slate-50 px-4 py-3 text-sm md:grid-cols-5 lg:grid-cols-10">
          <input type="hidden" name="asof" value={asof} />
          {filter.attention && <input type="hidden" name="attention" value={filter.attention} />}
          <Select name="customer" value={params.customer} label="All customers">
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.name}
              </option>
            ))}
          </Select>
          <Select name="bucket" value={filter.bucket ?? ""} label="Any ageing band">
            {AGEING_BUCKETS.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </Select>
          <Select name="status" value={filter.status ?? ""} label="Due or overdue">
            <option>Overdue</option>
            <option>Due</option>
          </Select>
          <Select name="disputed" value={filter.disputed ?? ""} label="Disputed or not">
            <option value="yes">Disputed only</option>
            <option value="no">Not disputed</option>
          </Select>
          <Select name="promise" value={filter.promise ?? ""} label="Any promise">
            <option>Broken</option>
            <option>Pending</option>
            <option>Kept</option>
            <option value="None">No promise</option>
          </Select>
          <Select name="followup" value={filter.followUpDue ? "due" : ""} label="Any follow-up">
            <option value="due">Follow-up due</option>
          </Select>
          <Select name="credit" value={filter.creditStatus ?? ""} label="Any credit status">
            {CREDIT_STATUSES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <Select name="show" value={filter.includeAll ? "all" : ""} label="Needing action">
            <option value="all">All open invoices</option>
          </Select>
          <select name="sort" defaultValue={sort} aria-label="Sort" className="rounded-lg border border-slate-300 px-2 py-2">
            <option value="priority">Sort: priority</option>
            <option value="outstanding">Sort: largest outstanding</option>
            <option value="days">Sort: longest overdue</option>
          </select>
          <div className="flex gap-2">
            <button type="submit" className="flex-1 rounded-lg bg-slate-800 px-3 py-2 font-medium text-white">
              Apply
            </button>
            <Link href={`/collections?asof=${asof}`} className="rounded-lg border border-slate-300 px-3 py-2">
              Reset
            </Link>
          </div>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2">Attention</th>
                <th className="px-3 py-2">Invoice</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Due date</th>
                <th className="px-3 py-2 text-right">Days late</th>
                <th className="px-3 py-2">Band</th>
                <th className="px-3 py-2 text-right">Outstanding</th>
                <th className="px-3 py-2">Promise</th>
                <th className="px-3 py-2">Follow-up</th>
                <th className="px-3 py-2">Credit</th>
                <th className="px-3 py-2">Why</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((it) => {
                const inv = it.position.invoice;
                return (
                  <tr key={inv.id} className={it.position.status === "Overdue" ? "bg-red-50/40" : ""}>
                    <td className="px-3 py-2">
                      {it.attention ? <Badge className={ATTN[it.attention]}>{it.attention}</Badge> : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/invoices/${inv.id}?asof=${asof}`} className="font-medium text-blue-700 hover:underline">
                        {inv.invoiceNo}
                      </Link>
                      <div className="mt-0.5 flex gap-1">
                        {inv.isDisputed && <Badge className="bg-amber-100 text-amber-800">Disputed</Badge>}
                        {it.position.isPartPaid && <Badge className="bg-slate-200 text-slate-700">Part-paid</Badge>}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/customers/${it.customer.id}?asof=${asof}`} className="hover:underline">
                        {it.customer.code} — {it.customer.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDate(inv.dueDate)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${it.position.daysPastDue > 0 ? "font-semibold text-red-700" : "text-slate-400"}`}>
                      {it.position.daysPastDue > 0 ? it.position.daysPastDue : "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{it.position.bucket}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatAmount(it.position.outstanding)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {it.promise ? (
                        <span title={`${formatAmount(it.promise.note.promiseAmount ?? 0)} by ${formatDate(it.promise.note.promiseDate!)}`}>
                          <Badge className={PROMISE[it.promise.status]}>{it.promise.status}</Badge>
                          <span className="ml-1 text-xs text-slate-500">{formatDate(it.promise.note.promiseDate!)}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {it.followUp ? (
                        <Link href={`/customers/${it.customer.id}/notes?asof=${asof}`} className="text-amber-800 hover:underline">
                          Due {formatDate(it.followUp.followUpDate!)}
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Badge className={CREDIT[it.creditStatus]}>{it.creditStatus}</Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">{it.reasons.join(" · ") || "—"}</td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-center text-slate-500">
                    Nothing matches these filters.
                    {!filter.includeAll && " Not-due invoices with no follow-up, promise or dispute are hidden — choose “All open invoices” to see them."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Credit exposure */}
        <section className="rounded-xl border bg-white lg:col-span-3">
          <h2 className="border-b px-4 py-3 font-semibold">Credit exposure by customer</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2 text-right">Invoice outstanding</th>
                  <th className="px-3 py-2 text-right">Unapplied credit</th>
                  <th className="px-3 py-2 text-right">Net balance</th>
                  <th className="px-3 py-2 text-right">Credit limit</th>
                  <th className="px-3 py-2 text-right">Used</th>
                  <th className="px-3 py-2">Credit status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {credit.map((r) => (
                  <tr key={r.customer.id}>
                    <td className="px-3 py-2">
                      <Link href={`/customers/${r.customer.id}?asof=${asof}`} className="text-blue-700 hover:underline">
                        {r.customer.code} — {r.customer.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatAmount(r.position.outstanding)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.position.unappliedCredit > 0 ? "font-semibold text-amber-700" : "text-slate-400"}`}>
                      {formatAmount(r.position.unappliedCredit)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">{formatDrCr(r.position.netBalance)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatAmount(r.customer.creditLimit)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.utilisationPct}%</td>
                    <td className="px-3 py-2">
                      <Badge className={CREDIT[r.creditStatus]}>{r.creditStatus}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t px-4 py-2 text-xs text-slate-500">
            Net balance = invoice outstanding − unapplied credit (R13). Used = net balance ÷ limit. Credit status is a
            workflow indicator (over limit; near = 80% or more used), not a credit-risk assessment.
          </p>
        </section>

        {/* Unapplied receipts */}
        <section className="rounded-xl border bg-white lg:col-span-2">
          <h2 className="border-b px-4 py-3 font-semibold">Unapplied receipts to allocate</h2>
          {unappliedReceipts.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">None as at this date.</p>
          ) : (
            <ul className="divide-y">
              {unappliedReceipts.map((r) => (
                <li key={r.receipt.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">{r.customerName}</p>
                    <p className="text-xs text-slate-500">
                      {r.receipt.receiptNo} · {formatDate(r.receipt.receiptDate)} · settlement {formatAmount(r.settlement)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums text-amber-700">{formatAmount(r.unapplied)}</p>
                    <Link href={`/receipts/${r.receipt.id}/allocate?asof=${asof}`} className="text-xs text-blue-700 hover:underline">
                      Allocate
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

const ATTN: Record<Attention, string> = {
  Critical: "bg-red-600 text-white",
  High: "bg-amber-500 text-white",
  Normal: "bg-slate-200 text-slate-800",
};
const CREDIT: Record<CreditStatus, string> = {
  "Over Limit": "bg-red-100 text-red-800",
  "Near Limit": "bg-amber-100 text-amber-800",
  "Within Limit": "bg-green-100 text-green-800",
};
const PROMISE = { Broken: "bg-red-100 text-red-800", Pending: "bg-blue-100 text-blue-800", Kept: "bg-green-100 text-green-800" };

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{children}</span>;
}

function Select({ name, value, label, children }: { name: string; value?: string; label: string; children: React.ReactNode }) {
  return (
    <select name={name} defaultValue={value ?? ""} aria-label={label} className="rounded-lg border border-slate-300 px-2 py-2">
      <option value="">{label}</option>
      {children}
    </select>
  );
}

function Kpi({ label, value, note, tone, href }: { label: string; value: string; note?: string; tone?: "red" | "amber"; href?: string }) {
  const body = (
    <>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${tone === "red" ? "text-red-700" : tone === "amber" ? "text-amber-700" : ""}`}>
        {value}
      </p>
      {note && <p className="text-xs text-slate-500">{note}</p>}
    </>
  );
  const cls = "block rounded-xl border border-slate-200 bg-white p-3 shadow-sm";
  return href ? (
    <Link href={href} className={`${cls} hover:border-slate-400`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
