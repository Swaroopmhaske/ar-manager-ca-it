import Link from "next/link";
import { notFound } from "next/navigation";
import { loadArData } from "@/lib/ar/load";
import { getAsOf } from "@/lib/asof";
import { invoiceListRows } from "@/lib/ar/lists";
import { RemoveAllocationButton } from "@/app/receipts/components/CorrectionButtons";
import { formatAmount, formatDate } from "@/lib/ar/format";

export default async function InvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ asof?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;

  const asof = getAsOf(query.asof);
  const invoiceId = Number(id);

  const data = await loadArData();

  const invoice = data.invoices.find(
    (item) => item.id === invoiceId
  );

  if (!invoice) {
    notFound();
  }

  // Cancelled invoices keep their page (R8: they keep their number and show
  // as Cancelled); an invoice dated after the as-at date does not exist yet.
  const row = invoiceListRows(data, asof).find((r) => r.invoice.id === invoice.id);
  const position = row ?? {
    received: 0,
    credited: 0,
    outstanding: 0,
    status: "Not yet issued" as const,
    daysLate: 0,
    isPartPaid: false,
  };
  const isCancelled = invoice.isCancelled;

  const customer = data.customers.find(
    (item) => item.id === invoice.customerId
  );

  const allocations = data.allocations.filter(
    (item) =>
      item.invoiceId === invoice.id &&
      item.allocationDate <= asof
  );

  const creditNotes = data.creditNotes.filter(
    (item) =>
      item.invoiceId === invoice.id &&
      item.creditNoteDate <= asof
  );

  const notes = data.notes
    .filter(
      (note) =>
        note.invoiceId === invoice.id &&
        note.noteDate <= asof
    )
    .sort((a, b) => b.noteDate.localeCompare(a.noteDate));

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-6">
        <Link
          href={`/invoices?asof=${encodeURIComponent(asof)}`}
          className="text-sm text-blue-600 hover:underline"
        >
          ← Back to Invoices
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">
              {invoice.invoiceNo}
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              {customer?.code} — {customer?.name}
            </p>
          </div>

          <div className="flex gap-2">
            {!isCancelled && (
            <Link
              href={`/invoices/${invoice.id}/credit-note?asof=${encodeURIComponent(asof)}`}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Credit Note
            </Link>
            )}

            <Link
              href={`/invoices/${invoice.id}/actions?asof=${encodeURIComponent(asof)}`}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              Actions
            </Link>
          </div>
        </div>
      </div>

      {isCancelled && (
        <p className="mb-6 rounded-lg border border-slate-300 bg-slate-100 p-3 text-sm text-slate-700">
          This invoice is <strong>Cancelled</strong>. It keeps its number but is left out of every total, balance,
          ageing figure, statement and DSO.
        </p>
      )}
      {!row && (
        <p className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          This invoice is dated {formatDate(invoice.invoiceDate)}, after the as-at date {formatDate(asof)}, so it does
          not count yet.
        </p>
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <Card
          label="Invoice Total"
          value={formatAmount(invoice.total)}
        />

        <Card
          label="Received"
          value={formatAmount(position.received)}
        />

        <Card
          label="Credited"
          value={formatAmount(position.credited)}
        />

        <Card
          label="Outstanding"
          value={formatAmount(position.outstanding)}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold">
            Invoice Details
          </h2>

          <div className="space-y-3 text-sm">
            <Detail label="Invoice Number" value={invoice.invoiceNo} />
            <Detail
              label="Customer"
              value={`${customer?.code ?? ""} — ${customer?.name ?? ""}`}
            />
            <Detail
              label="Invoice Date"
              value={formatDate(invoice.invoiceDate)}
            />
            <Detail
              label="Due Date"
              value={formatDate(invoice.dueDate)}
            />
            <Detail
              label="As-at Date"
              value={formatDate(asof)}
            />
            <Detail
              label="Status"
              value={position.status}
            />
            <Detail
              label="Days Late"
              value={position.daysLate > 0 ? String(position.daysLate) : "—"}
            />
            <Detail
              label="Part Paid"
              value={position.isPartPaid ? "Yes" : "No"}
            />
            <Detail
              label="Disputed"
              value={invoice.isDisputed ? "Yes" : "No"}
            />
            <Detail
              label="Description"
              value={invoice.description}
            />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold">
            Tax Breakdown
          </h2>

          <div className="space-y-3 text-sm">
            <Detail
              label="Taxable Value"
              value={formatAmount(invoice.taxableValue)}
            />
            <Detail
              label="GST Rate"
              value={`${invoice.gstRatePct}%`}
            />
            <Detail
              label="CGST"
              value={formatAmount(invoice.cgst)}
            />
            <Detail
              label="SGST"
              value={formatAmount(invoice.sgst)}
            />
            <Detail
              label="IGST"
              value={formatAmount(invoice.igst)}
            />

            <div className="border-t border-slate-200 pt-3">
              <Detail
                label="Total"
                value={formatAmount(invoice.total)}
              />
            </div>
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold">
          Allocations
        </h2>

        {allocations.length === 0 ? (
          <p className="text-sm text-slate-500">
            No allocations as at {formatDate(asof)}.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="py-3">Allocation Date</th>
                <th className="py-3">Receipt</th>
                <th className="py-3 text-right">Amount</th>
                <th className="py-3 text-right" />
              </tr>
            </thead>

            <tbody>
              {allocations.map((allocation) => {
                const receipt = data.receipts.find(
                  (item) => item.id === allocation.receiptId
                );

                return (
                  <tr
                    key={allocation.id}
                    className="border-b border-slate-100"
                  >
                    <td className="py-3">
                      {formatDate(allocation.allocationDate)}
                    </td>

                    <td className="py-3">
                      {receipt ? (
                        <Link href={`/receipts/${receipt.id}/allocate?asof=${asof}`} className="text-blue-700 hover:underline">
                          {receipt.receiptNo}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>

                    <td className="py-3 text-right">
                      {formatAmount(allocation.amount)}
                    </td>
                    <td className="py-3 text-right">
                      <RemoveAllocationButton
                        allocationId={allocation.id}
                        label={`${formatAmount(allocation.amount)} from ${receipt?.receiptNo ?? "the receipt"}`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold">
          Credit Notes
        </h2>

        {creditNotes.length === 0 ? (
          <p className="text-sm text-slate-500">
            No credit notes as at {formatDate(asof)}.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="py-3">Credit Note</th>
                <th className="py-3">Date</th>
                <th className="py-3 text-right">Amount</th>
              </tr>
            </thead>

            <tbody>
              {creditNotes.map((note) => (
                <tr
                  key={note.id}
                  className="border-b border-slate-100"
                >
                  <td className="py-3">
                    {note.creditNoteNo}
                  </td>

                  <td className="py-3">
                    {formatDate(note.creditNoteDate)}
                  </td>

                  <td className="py-3 text-right">
                    {formatAmount(note.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold">
          Notes
        </h2>

        {notes.length === 0 ? (
          <p className="text-sm text-slate-500">
            No notes for this invoice.
          </p>
        ) : (
          <div className="space-y-4">
            {notes.map((note) => (
              <div
                key={note.id}
                className="border-l-2 border-slate-300 pl-4"
              >
                <div className="text-xs text-slate-500">
                  {formatDate(note.noteDate)} · {note.noteType}
                </div>

                <p className="mt-1 text-sm">
                  {note.body}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function Card({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-bold">{value}</p>
    </div>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}