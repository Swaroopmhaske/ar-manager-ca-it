import Link from "next/link";
import { notFound } from "next/navigation";
import { loadArData } from "@/lib/ar/load";
import { formatAmount, formatDate } from "@/lib/ar/format";
import { getAsOf } from "@/lib/asof";
import { notePositions } from "@/lib/ar/calculations";
import NotesForm from "./NotesForm";
import FollowUpButton from "./FollowUpButton";

export default async function CustomerNotesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ asof?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;

  const customerId = Number(id);

  if (!Number.isInteger(customerId)) {
    notFound();
  }

  const asOf = getAsOf(query.asof);
  const data = await loadArData();

  const customer = data.customers.find(
    (item) => item.id === customerId,
  );

  if (!customer) {
    notFound();
  }

  const notes = data.notes
    .filter(
      (note) =>
        note.customerId === customerId &&
        note.noteDate <= asOf,
    )
    .sort((a, b) => b.noteDate.localeCompare(a.noteDate));

  const invoices = data.invoices
    .filter(
      (invoice) =>
        invoice.customerId === customerId &&
        invoice.invoiceDate <= asOf &&
        !invoice.isCancelled,
    )
    .sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));

  const notePositionMap = new Map(
    notePositions(data, asOf).map((position) => [
      position.note.id,
      position,
    ]),
  );

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Customer Notes</h1>

        <p className="mt-1 text-sm text-slate-500">
          {customer.code} — {customer.name} · as of{" "}
          {formatDate(asOf)}
        </p>
      </div>

      <div className="mb-6">
        <Link
          href={`/customers/${customerId}?asof=${asOf}`}
          className="inline-flex rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          ← Back to Customer
        </Link>
      </div>

      <div className="mb-8">
        <NotesForm
          customerId={customerId}
          invoices={invoices}
          asOf={asOf}
        />
      </div>

      <section className="rounded-xl border bg-white">
        <div className="border-b px-5 py-4">
          <h2 className="font-semibold">Activity timeline</h2>
        </div>

        <div className="divide-y">
          {notes.map((note) => {
            const promiseStatus =
              notePositionMap.get(note.id)?.promiseStatus;

            return (
              <div key={note.id} className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold">{note.noteType}</p>

                    <p className="mt-1 text-xs text-slate-500">
                      {formatDate(note.noteDate)}
                    </p>
                  </div>

                  {note.followUpDate && (
  <div className="flex items-center gap-2">
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${
        note.followUpDone
          ? "bg-emerald-100 text-emerald-700"
          : "bg-amber-100 text-amber-700"
      }`}
    >
      {note.followUpDone
        ? "Follow-up done"
        : `Follow-up ${formatDate(note.followUpDate)}`}
    </span>

    {!note.followUpDone && (
      <FollowUpButton
        noteId={note.id}
        customerId={customerId}
      />
    )}
  </div>
)}
                </div>

                <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">
                  {note.body}
                </p>

                {note.promiseDate &&
                  note.promiseAmount !== null && (
                    <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
                      <div>
                        <span className="font-medium">
                          Promise:
                        </span>{" "}
                        {formatAmount(note.promiseAmount)} by{" "}
                        {formatDate(note.promiseDate)}
                      </div>

                      {promiseStatus && (
                        <div className="mt-2">
                          <span className="font-medium">
                            Status:
                          </span>{" "}
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-semibold ${
                              promiseStatus === "Kept"
                                ? "bg-emerald-100 text-emerald-700"
                                : promiseStatus === "Broken"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {promiseStatus}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
              </div>
            );
          })}

          {notes.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500">
              No notes found for this customer.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}