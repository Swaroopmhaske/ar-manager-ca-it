import { loadArData } from "@/lib/ar/load";
import { getAsOf } from "@/lib/asof";
import ReceiptForm from "../ReceiptForm";

export default async function NewReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{ asof?: string }>;
}) {
  const params = await searchParams;
  const asOf = getAsOf(params.asof);
  const data = await loadArData();

  const customers = data.customers
    .filter((customer) => customer.isActive)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Record Receipt</h1>
        <p className="mt-1 text-sm text-slate-500">
          Record a customer receipt and optional TDS settlement.
        </p>
      </div>

      <ReceiptForm customers={customers} asOf={asOf} />
    </main>
  );
}