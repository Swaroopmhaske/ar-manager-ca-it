import Link from "next/link";
import { loadArData } from "@/lib/ar/load";
import { getAsOf } from "@/lib/asof";
import { AGEING_BUCKETS, statement } from "@/lib/ar/calculations";
import { statementPeriod } from "@/lib/ar/statement-params";
import { formatAmount, formatDate, formatDrCr } from "@/lib/ar/format";
import { SELLER } from "@/lib/seller";
import PrintButton from "./PrintButton";

type Search = { customer?: string; from?: string; to?: string; asof?: string };

export default async function StatementPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const asof = getAsOf(params.asof);
  const { from, to, error } = statementPeriod(asof, params.from, params.to);

  const data = await loadArData();
  const customers = [...data.customers].sort((a, b) => a.code.localeCompare(b.code));
  const customer = data.customers.find((c) => c.id === Number(params.customer));
  const result = customer && !error ? statement(data, customer.id, from, to) : null;
  const query = customer ? `customer=${customer.id}&from=${from}&to=${to}` : "";

  return (
    <main className="mx-auto max-w-5xl px-6 py-8 print:max-w-none print:p-0">
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4 print:hidden">
        <input type="hidden" name="asof" value={asof} />
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600">Customer</span>
          <select name="customer" defaultValue={customer?.id ?? ""} required className="rounded-lg border border-slate-300 px-3 py-2">
            <option value="">Choose a customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600">From</span>
          <input type="date" name="from" defaultValue={from} className="rounded-lg border border-slate-300 px-3 py-2" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600">To</span>
          <input type="date" name="to" defaultValue={to} className="rounded-lg border border-slate-300 px-3 py-2" />
        </label>
        <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          Show statement
        </button>
        {result && (
          <div className="ml-auto flex gap-2">
            <a href={`/statement/export?${query}`} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50">
              Export CSV
            </a>
            <PrintButton />
          </div>
        )}
      </form>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!customer && !error && <p className="text-sm text-slate-500">Choose a customer and period to see the statement.</p>}

      {customer && result && (
        <article className="rounded-xl border bg-white p-8 print:rounded-none print:border-0 print:p-0">
          <header className="mb-6 flex flex-wrap justify-between gap-4 border-b pb-4">
            <div>
              <p className="text-lg font-bold">{SELLER.name}</p>
              <p className="text-sm text-slate-600">
                {SELLER.address}, {SELLER.state}
              </p>
            </div>
            <div className="text-right">
              <h1 className="text-xl font-bold">Statement of Account</h1>
              <p className="text-sm text-slate-600">
                {formatDate(from)} to {formatDate(to)}
              </p>
            </div>
          </header>

          <section className="mb-6 text-sm">
            <p className="font-semibold">
              {customer.name} <span className="font-normal text-slate-500">({customer.code})</span>
            </p>
            <p className="text-slate-600">
              {[customer.city, customer.state].filter(Boolean).join(", ")}
              {customer.gstin ? ` · GSTIN ${customer.gstin}` : ""}
            </p>
            <Link href={`/customers/${customer.id}?asof=${to}`} className="text-xs text-blue-700 hover:underline print:hidden">
              Open customer
            </Link>
          </section>

          <table className="w-full text-sm">
            <thead className="border-y bg-slate-50 print:bg-transparent">
              <tr>
                <th className="px-2 py-2 text-left">Date</th>
                <th className="px-2 py-2 text-left">Particulars</th>
                <th className="px-2 py-2 text-left">Document</th>
                <th className="px-2 py-2 text-right">Debit</th>
                <th className="px-2 py-2 text-right">Credit</th>
                <th className="px-2 py-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr className="font-medium">
                <td className="px-2 py-2">{formatDate(from)}</td>
                <td className="px-2 py-2" colSpan={4}>
                  Opening balance
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{formatDrCr(result.openingBalance)}</td>
              </tr>
              {result.lines.map((line) => (
                <tr key={`${line.date}-${line.type}-${line.documentNo}`}>
                  <td className="px-2 py-2">{formatDate(line.date)}</td>
                  <td className="px-2 py-2">{line.type}</td>
                  <td className="px-2 py-2">{line.documentNo}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{line.debit > 0 ? formatAmount(line.debit) : ""}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{line.credit > 0 ? formatAmount(line.credit) : ""}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatDrCr(line.balance)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-400 font-bold">
                <td className="px-2 py-2">{formatDate(to)}</td>
                <td className="px-2 py-2" colSpan={4}>
                  Closing balance
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{formatDrCr(result.closingBalance)}</td>
              </tr>
            </tbody>
          </table>

          <footer className="mt-8 break-inside-avoid">
            <h2 className="mb-2 text-sm font-semibold">Closing balance by age (days past due date) as at {formatDate(to)}</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y bg-slate-50 print:bg-transparent">
                  {AGEING_BUCKETS.map((b) => (
                    <th key={b} className="px-2 py-1.5 text-right">
                      {b}
                    </th>
                  ))}
                  <th className="px-2 py-1.5 text-right">Unapplied credit</th>
                  <th className="px-2 py-1.5 text-right">Closing balance</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  {AGEING_BUCKETS.map((b) => (
                    <td key={b} className="px-2 py-1.5 text-right tabular-nums">
                      {formatAmount(result.ageing[b])}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {result.unappliedCredit > 0 ? `(${formatAmount(result.unappliedCredit)})` : formatAmount(0)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{formatDrCr(result.closingBalance)}</td>
                </tr>
              </tbody>
            </table>
            {result.unappliedCredit > 0 && (
              <p className="mt-2 text-xs text-slate-600">
                We hold {formatAmount(result.unappliedCredit)} received from you that is not yet matched to an invoice; it is
                deducted above.
              </p>
            )}
          </footer>
        </article>
      )}
    </main>
  );
}
