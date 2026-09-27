import { loadArData } from "@/lib/ar/load";

export default async function Home() {
  const data = await loadArData();

  return (
    <main className="min-h-screen p-8">
      <h1 className="mb-2 text-3xl font-bold">AR Manager</h1>

      <p className="mb-8 text-gray-600">
        Data layer connection test
      </p>

      <div className="space-y-2">
        <p>Customers: {data.customers.length}</p>
        <p>Invoices: {data.invoices.length}</p>
        <p>Credit Notes: {data.creditNotes.length}</p>
        <p>Receipts: {data.receipts.length}</p>
        <p>Allocations: {data.allocations.length}</p>
        <p>Notes: {data.notes.length}</p>
      </div>
    </main>
  );
}