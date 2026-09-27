import { notFound } from "next/navigation";
import { loadArData } from "@/lib/ar/load";
import { formatAmount, formatDate } from "@/lib/ar/format";
import { settlementValue } from "@/lib/ar/date";
import { invoicePosition } from "@/lib/ar/calculations";
import AllocationForm from "./AllocationForm";

export default async function AllocateReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ asof?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;

  const receiptId = Number(id);

  if (!Number.isInteger(receiptId)) {
    notFound();
  }

  const data = await loadArData();

  const receipt = data.receipts.find((item) => item.id === receiptId);

  if (!receipt) {
    notFound();
  }

  const asOf = query.asof ?? receipt.receiptDate;

  const customer = data.customers.find(
    (item) => item.id === receipt.customerId,
  );

  if (!customer) {
    notFound();
  }

  const allocated = data.allocations
    .filter(
      (allocation) =>
        allocation.receiptId === receipt.id &&
        allocation.allocationDate <= asOf,
    )
    .reduce((sum, allocation) => sum + allocation.amount, 0);

  const settlement = settlementValue(
    receipt.bankAmount,
    receipt.tdsAmount,
  );

  const unapplied = settlement - allocated;

  const invoices = data.invoices
    .filter(
      (invoice) =>
        invoice.customerId === receipt.customerId &&
        invoice.invoiceDate <= asOf,
    )
    .map((invoice) => ({
      invoice,
      position: invoicePosition(data, invoice, asOf),
    }))
    .filter(
      (
        item,
      ): item is {
        invoice: typeof item.invoice;
        position: NonNullable<typeof item.position>;
      } => item.position !== null,
    )
    .filter((item) => item.position.outstanding > 0);

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Allocate Receipt</h1>

        <p className="mt-1 text-sm text-slate-500">
          {receipt.receiptNo} · {customer.code} — {customer.name}
        </p>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-slate-500">Receipt date</p>
          <p className="mt-2 font-semibold">
            {formatDate(receipt.receiptDate)}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-slate-500">Settlement</p>
          <p className="mt-2 font-semibold">
            {formatAmount(settlement)}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-slate-500">Unapplied credit</p>
          <p className="mt-2 font-semibold">
            {formatAmount(unapplied)}
          </p>
        </div>
      </div>

      <AllocationForm
        receipt={receipt}
        invoices={invoices}
        unapplied={unapplied}
        asOf={asOf}
      />
    </main>
  );
}