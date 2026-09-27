import Link from "next/link";
import { notFound } from "next/navigation";
import { loadArData } from "@/lib/ar/load";
import { getAsOf } from "@/lib/asof";
import { formatAmount, formatDate } from "@/lib/ar/format";
import CreditNoteForm from "./CreditNoteForm";

export default async function CreditNotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ asof?: string }>;
}) {
  const { id } = await params;
  const { asof = "" } = await searchParams;

  const data = await loadArData();
  const invoiceId = Number(id);

  const invoice = data.invoices.find(
    (item) => item.id === invoiceId
  );

  if (!invoice) {
    notFound();
  }

  const effectiveAsof = getAsOf(asof);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link
        href={`/invoices/${invoice.id}?asof=${encodeURIComponent(
          effectiveAsof
        )}`}
        className="text-sm text-blue-600 hover:underline"
      >
        ← Back to Invoice
      </Link>

      <h1 className="mt-4 text-2xl font-bold">
        Raise Credit Note
      </h1>

      <p className="mt-1 text-sm text-slate-500">
        {invoice.invoiceNo} · Invoice date{" "}
        {formatDate(invoice.invoiceDate)}
      </p>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-slate-500">Taxable Value</p>
            <p className="font-semibold">
              {formatAmount(invoice.taxableValue)}
            </p>
          </div>

          <div>
            <p className="text-slate-500">GST Rate</p>
            <p className="font-semibold">
              {invoice.gstRatePct}%
            </p>
          </div>

          <div>
            <p className="text-slate-500">Invoice Total</p>
            <p className="font-semibold">
              {formatAmount(invoice.total)}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <CreditNoteForm
          invoiceId={invoice.id}
          invoiceTotal={invoice.total}
          gstRatePct={invoice.gstRatePct}
          asof={effectiveAsof}
        />
      </div>
    </main>
  );
}