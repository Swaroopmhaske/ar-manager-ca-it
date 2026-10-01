import Link from "next/link";
import { loadArData } from "@/lib/ar/load";
import { getAsOf } from "@/lib/asof";
import { openInvoicesForPayment, type OpenInvoice } from "@/lib/ar/payments";
import ReceiptForm from "../ReceiptForm";

export default async function NewReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{ asof?: string; customer?: string }>;
}) {
  const params = await searchParams;
  const asOf = getAsOf(params.asof);
  const data = await loadArData();

  // Payments are recorded for any customer, including inactive ones
  // (R9 only stops new invoices); inactive customers are listed last.
  const customers = [...data.customers]
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.code.localeCompare(b.code))
    .map((c) => ({
      id: c.id,
      code: c.code,
      name: c.isActive ? c.name : `${c.name} (inactive)`,
      tdsRatePct: c.tdsRatePct,
    }));

  const openByCustomer: Record<number, OpenInvoice[]> = {};
  for (const c of data.customers) {
    openByCustomer[c.id] = openInvoicesForPayment(data, c.id, "9999-12-31");
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <Link href={`/receipts?asof=${asOf}`} className="text-sm text-blue-600 hover:underline">
        ← Back to Receipts
      </Link>
      <h1 className="mt-3 text-2xl font-bold">Record payment</h1>
      <p className="mt-1 mb-6 text-sm text-slate-500">
        The receipt and its allocations are saved together: if the allocations cannot be saved, the receipt is not kept.
      </p>
      <ReceiptForm
        customers={customers}
        openByCustomer={openByCustomer}
        asOf={asOf}
        initialCustomerId={Number(params.customer) || undefined}
      />
    </main>
  );
}
