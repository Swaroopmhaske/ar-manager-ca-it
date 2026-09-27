import Link from "next/link";
import { loadArData } from "@/lib/ar/load";
import { getAsOf } from "@/lib/asof";
import InvoiceForm from "../InvoiceForm";

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ asof?: string }>;
}) {
  const params = await searchParams;
  const asof = getAsOf(params.asof);

  const data = await loadArData();

  const activeCustomers = data.customers.filter(
    (customer) => customer.isActive
  );

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="mb-6">
        <Link
          href={`/invoices?asof=${encodeURIComponent(asof)}`}
          className="text-sm text-blue-600 hover:underline"
        >
          ← Back to Invoices
        </Link>

        <h1 className="mt-3 text-2xl font-bold">Create Invoice</h1>

        <p className="mt-1 text-sm text-slate-500">
          Create a new invoice for an active customer.
        </p>
      </div>

      <InvoiceForm
        asof={asof}
        customers={activeCustomers}
      />
    </main>
  );
}