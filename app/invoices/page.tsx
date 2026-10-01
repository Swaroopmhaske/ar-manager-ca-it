import Link from "next/link";
import { loadArData } from "@/lib/ar/load";
import { getAsOf } from "@/lib/asof";
import { formatAmount, formatDate } from "@/lib/ar/format";
import {
  filterInvoiceRows,
  invoiceListRows,
  invoiceListTotals,
  INVOICE_STATUSES,
  invoiceFilterFromParams,
  isInvoiceSortKey,
  sortInvoiceRows,
  type InvoiceListStatus,
} from "@/lib/ar/lists";
import SortHeader from "../components/SortHeader";

type Search = {
  asof?: string;
  q?: string;
  customer?: string;
  status?: string;
  disputed?: string;
  from?: string;
  to?: string;
  sort?: string;
  dir?: string;
};

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const asof = getAsOf(params.asof);
  const data = await loadArData();

  const filter = invoiceFilterFromParams(params);
  const sort = isInvoiceSortKey(params.sort) ? params.sort : "invoiceDate";
  const dir = params.dir === "asc" ? "asc" : params.dir === "desc" ? "desc" : sort === "invoiceDate" ? "desc" : "asc";

  const rows = sortInvoiceRows(filterInvoiceRows(invoiceListRows(data, asof), filter), sort, dir);
  const totals = invoiceListTotals(rows);

  const keep: Record<string, string | undefined> = {
    asof,
    q: params.q,
    customer: params.customer,
    status: params.status,
    disputed: params.disputed,
    from: params.from,
    to: params.to,
  };
  const exportQuery = new URLSearchParams(
    Object.entries({ ...keep, sort, dir }).filter((e): e is [string, string] => !!e[1])
  ).toString();
  const header = (label: string, column: string, align: "left" | "right" = "left") => (
    <SortHeader label={label} column={column} sort={sort} dir={dir} params={keep} basePath="/invoices" align={align} />
  );
  const customers = [...data.customers].sort((a, b) => a.code.localeCompare(b.code));

  return (
    <main className="mx-auto max-w-[90rem] p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Invoices</h1>
          <p className="mt-1 text-sm text-slate-500">Position as at {formatDate(asof)}</p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/invoices/export?${exportQuery}`}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Export CSV
          </a>
          <Link
            href={`/invoices/new?asof=${encodeURIComponent(asof)}`}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            + New invoice
          </Link>
        </div>
      </div>

      <form className="mb-5 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-4 lg:grid-cols-7">
        <input type="hidden" name="asof" value={asof} />
        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="dir" value={dir} />
        <input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Invoice number…"
          aria-label="Search by invoice number"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <select name="customer" defaultValue={params.customer ?? ""} aria-label="Customer" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">All customers</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} — {c.name}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={filter.status} aria-label="Status" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          {INVOICE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === "All" ? "All statuses" : s}
            </option>
          ))}
        </select>
        <select name="disputed" defaultValue={filter.disputed} aria-label="Disputed" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="all">Disputed or not</option>
          <option value="yes">Disputed only</option>
          <option value="no">Not disputed</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">From</span>
          <input type="date" name="from" defaultValue={filter.from ?? ""} className="w-full rounded-lg border border-slate-300 px-2 py-2" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">To</span>
          <input type="date" name="to" defaultValue={filter.to ?? ""} className="w-full rounded-lg border border-slate-300 px-2 py-2" />
        </label>
        <div className="flex gap-2">
          <button type="submit" className="flex-1 rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600">
            Apply
          </button>
          <Link href={`/invoices?asof=${asof}`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            Reset
          </Link>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              {header("Invoice", "invoiceNo")}
              {header("Customer", "customer")}
              {header("Invoice date", "invoiceDate")}
              {header("Due date", "dueDate")}
              {header("Total", "total", "right")}
              {header("Received", "received", "right")}
              {header("Credited", "credited", "right")}
              {header("Outstanding", "outstanding", "right")}
              {header("Status", "status")}
              {header("Days late", "daysLate", "right")}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const cancelled = row.status === "Cancelled";
              return (
                <tr
                  key={row.invoice.id}
                  className={`border-b border-slate-100 ${
                    row.status === "Overdue" ? "bg-red-50 text-red-900" : cancelled ? "text-slate-400" : ""
                  }`}
                >
                  <td className="px-3 py-2.5">
                    <Link href={`/invoices/${row.invoice.id}?asof=${asof}`} className="font-medium text-blue-700 hover:underline">
                      {row.invoice.invoiceNo}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    {row.customerCode} — {row.customerName}
                  </td>
                  <td className="px-3 py-2.5">{formatDate(row.invoice.invoiceDate)}</td>
                  <td className="px-3 py-2.5">{formatDate(row.invoice.dueDate)}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${cancelled ? "line-through" : ""}`}>
                    {formatAmount(row.invoice.total)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{cancelled ? "—" : formatAmount(row.received)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{cancelled ? "—" : formatAmount(row.credited)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                    {cancelled ? "—" : formatAmount(row.outstanding)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex flex-wrap gap-1">
                      <StatusBadge status={row.status} />
                      {row.isPartPaid && <Label tone="slate">Part-paid</Label>}
                      {row.isDisputed && <Label tone="amber">Disputed</Label>}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{row.daysLate > 0 ? row.daysLate : "—"}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-slate-500">
                  No invoices match these filters.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
            <tr>
              <td className="px-3 py-3" colSpan={4}>
                Total · {totals.count} invoice{totals.count === 1 ? "" : "s"}
                <span className="block text-xs font-normal text-slate-500">Cancelled invoices are listed but not added in.</span>
              </td>
              <td className="px-3 py-3 text-right tabular-nums">{formatAmount(totals.total)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{formatAmount(totals.received)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{formatAmount(totals.credited)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{formatAmount(totals.outstanding)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: InvoiceListStatus }) {
  const tone = { Paid: "green", Due: "blue", Overdue: "red", Cancelled: "slate" } as const;
  return <Label tone={tone[status]}>{status}</Label>;
}

function Label({ tone, children }: { tone: "green" | "blue" | "red" | "slate" | "amber"; children: React.ReactNode }) {
  const styles = {
    green: "bg-green-100 text-green-800",
    blue: "bg-blue-100 text-blue-800",
    red: "bg-red-100 text-red-800",
    slate: "bg-slate-200 text-slate-700",
    amber: "bg-amber-100 text-amber-800",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[tone]}`}>{children}</span>;
}
