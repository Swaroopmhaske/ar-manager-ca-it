import Link from "next/link";
import { notFound } from "next/navigation";
import { loadArData } from "@/lib/ar/load";
import { getAsOf } from "@/lib/asof";
import { formatAmount, formatDate } from "@/lib/ar/format";
import { openInvoicesForPayment, receiptAvailable } from "@/lib/ar/payments";
import AllocationForm from "./AllocationForm";
import { DeleteReceiptButton, RemoveAllocationButton } from "../../components/CorrectionButtons";

export default async function AllocateReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ asof?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const asOf = getAsOf(query.asof);

  const data = await loadArData();
  const receipt = data.receipts.find((r) => r.id === Number(id));
  if (!receipt) notFound();
  const customer = data.customers.find((c) => c.id === receipt.customerId);
  if (!customer) notFound();

  const settlement = receipt.bankAmount + receipt.tdsAmount;
  const available = receiptAvailable(data, receipt.id);
  const invoiceNo = new Map(data.invoices.map((i) => [i.id, i.invoiceNo]));
  const allocations = data.allocations
    .filter((a) => a.receiptId === receipt.id)
    .sort((a, b) => a.allocationDate.localeCompare(b.allocationDate) || a.id - b.id);
  const backHref = `/customers/${customer.id}?asof=${encodeURIComponent(asOf)}`;

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <Link href={backHref} className="text-sm text-blue-600 hover:underline">
        ← Back to {customer.name}
      </Link>
      <h1 className="mt-3 text-2xl font-bold">Receipt {receipt.receiptNo}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {customer.code} — {customer.name} · {formatDate(receipt.receiptDate)} · {receipt.mode}
        {receipt.reference ? ` · ${receipt.reference}` : ""}
      </p>

      <div className="my-6 grid gap-4 md:grid-cols-4">
        <Card label="Bank amount" value={formatAmount(receipt.bankAmount)} />
        <Card label="TDS" value={formatAmount(receipt.tdsAmount)} />
        <Card label="Settlement value" value={formatAmount(settlement)} />
        <Card label="Unapplied (all dates)" value={formatAmount(available)} />
      </div>

      <section className="mb-8 rounded-xl border bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Allocations</h2>
          {allocations.length === 0 && <DeleteReceiptButton receiptId={receipt.id} receiptNo={receipt.receiptNo} />}
        </div>
        {allocations.length === 0 ? (
          <p className="text-sm text-slate-500">None. A receipt with no allocations can be deleted.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-2">Date</th>
                <th className="py-2">Invoice</th>
                <th className="py-2 text-right">Amount</th>
                <th className="py-2 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {allocations.map((a) => (
                <tr key={a.id}>
                  <td className="py-2">{formatDate(a.allocationDate)}</td>
                  <td className="py-2">
                    <Link href={`/invoices/${a.invoiceId}?asof=${asOf}`} className="text-blue-600 hover:underline">
                      {invoiceNo.get(a.invoiceId)}
                    </Link>
                  </td>
                  <td className="py-2 text-right tabular-nums">{formatAmount(a.amount)}</td>
                  <td className="py-2 text-right">
                    <RemoveAllocationButton
                      allocationId={a.id}
                      label={`${formatAmount(a.amount)} to ${invoiceNo.get(a.invoiceId)}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {available > 0 ? (
        <section>
          <h2 className="mb-3 font-semibold">Allocate unapplied credit</h2>
          <AllocationForm
            receiptId={receipt.id}
            receiptDate={receipt.receiptDate}
            available={available}
            openInvoices={openInvoicesForPayment(data, customer.id, "9999-12-31")}
            defaultDate={asOf < receipt.receiptDate ? receipt.receiptDate : asOf}
            backHref={backHref}
          />
        </section>
      ) : (
        <p className="text-sm text-slate-500">
          This receipt is fully allocated
          {allocations.some((a) => a.allocationDate > asOf)
            ? `, including allocations dated after ${formatDate(asOf)}. Remove one of those to re-allocate the money.`
            : "."}
        </p>
      )}
    </main>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 font-semibold tabular-nums">{value}</p>
    </div>
  );
}
