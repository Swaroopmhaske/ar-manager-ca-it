import Link from "next/link";
import { loadArData } from "@/lib/ar/load";
import { getAsOf } from "@/lib/asof";
import { formatAmount, formatDate, formatDrCr } from "@/lib/ar/format";
import {
  customerListRows,
  filterCustomerRows,
  isCustomerSortKey,
  sortCustomerRows,
} from "@/lib/ar/lists";
import SortHeader from "../components/SortHeader";

type Search = { asof?: string; q?: string; status?: string; sort?: string; dir?: string };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const asof = getAsOf(params.asof);
  const status = params.status === "inactive" || params.status === "all" ? params.status : "active";
  const sort = isCustomerSortKey(params.sort) ? params.sort : "code";
  const dir = params.dir === "desc" ? "desc" : "asc";

  const data = await loadArData();
  const rows = sortCustomerRows(
    filterCustomerRows(customerListRows(data, asof), { q: params.q, active: status }),
    sort,
    dir
  );

  const keep = { asof, q: params.q, status };
  const header = (label: string, column: string, align: "left" | "right" = "left") => (
    <SortHeader label={label} column={column} sort={sort} dir={dir} params={keep} basePath="/customers" align={align} />
  );

  return (
    <main className="mx-auto max-w-[90rem] p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Customer Master</h1>
          <p className="mt-1 text-sm text-slate-500">Customer positions as at {formatDate(asof)}</p>
        </div>
        <Link
          href={`/customers/new?asof=${asof}`}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          + Add customer
        </Link>
      </div>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm">
        <input type="hidden" name="asof" value={asof} />
        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="dir" value={dir} />
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-600">Search</span>
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Code, name, contact or email"
            className="w-72 rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-600">Status</span>
          <select name="status" defaultValue={status} className="rounded-lg border border-slate-300 px-3 py-2">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
        </label>
        <button type="submit" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50">
          Apply
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-slate-50 text-slate-600">
            <tr>
              {header("Code", "code")}
              {header("Customer", "name")}
              {header("City, state", "location")}
              {header("Contact", "contact")}
              {header("Credit days", "creditDays", "right")}
              {header("Credit limit", "creditLimit", "right")}
              {header("Balance", "balance", "right")}
              {header("Overdue", "overdue", "right")}
              {header("Limit used", "limitUsed", "right")}
              {header("Status", "status")}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map(({ customer, position, limitUsedPct }) => (
              <tr key={customer.id} className="hover:bg-slate-50">
                <td className="px-3 py-3 font-medium">
                  <Link href={`/customers/${customer.id}?asof=${asof}`} className="text-blue-700 hover:underline">
                    {customer.code}
                  </Link>
                </td>
                <td className="px-3 py-3">{customer.name}</td>
                <td className="px-3 py-3">
                  {customer.city ?? "—"}, {customer.state ?? "—"}
                </td>
                <td className="px-3 py-3">
                  <div>{customer.contactPerson ?? "—"}</div>
                  <div className="text-xs text-slate-500">{customer.email ?? "—"}</div>
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{customer.creditDays}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatAmount(customer.creditLimit)}</td>
                <td className="px-3 py-3 text-right font-medium tabular-nums">
                  {formatDrCr(position.netBalance)}
                  {position.unappliedCredit > 0 && (
                    <div className="text-xs font-normal text-slate-500">
                      after {formatAmount(position.unappliedCredit)} unapplied
                    </div>
                  )}
                </td>
                <td className={`px-3 py-3 text-right tabular-nums ${position.overdue > 0 ? "font-medium text-red-700" : ""}`}>
                  {formatAmount(position.overdue)}
                </td>
                <td className={`px-3 py-3 text-right tabular-nums ${position.overLimit ? "font-semibold text-red-700" : ""}`}>
                  {limitUsedPct}%{position.overLimit && <div className="text-xs">Over limit</div>}
                </td>
                <td className="px-3 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      customer.isActive ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {customer.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-slate-500">
                  No customers match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Balance and limit used are net of unapplied credit (R13): money received but not yet allocated reduces what the
        customer owes.
      </p>
    </main>
  );
}
