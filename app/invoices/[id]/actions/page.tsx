import Link from "next/link";
import { notFound } from "next/navigation";
import { loadArData } from "@/lib/ar/load";
import { getAsOf } from "@/lib/asof";
import InvoiceActions from "./InvoiceActions";

export default async function InvoiceActionsPage({
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
        Invoice Actions
      </h1>

      <p className="mt-1 text-sm text-slate-500">
        {invoice.invoiceNo}
      </p>

      <div className="mt-6">
        <InvoiceActions
          invoiceId={invoice.id}
          invoiceNo={invoice.invoiceNo}
          isDisputed={invoice.isDisputed}
          isCancelled={invoice.isCancelled}
          asof={effectiveAsof}
        />
      </div>
    </main>
  );
}