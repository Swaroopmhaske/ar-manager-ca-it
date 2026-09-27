import Link from "next/link";
import { notFound } from "next/navigation";
import { loadArData } from "@/lib/ar/load";
import CustomerForm from "../../CustomerForm";

export default async function EditCustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ asof?: string }>;
}) {
  const { id } = await params;
  const { asof = "" } = await searchParams;

  const data = await loadArData();
  const customerId = Number(id);

  const customer = data.customers.find(
    (item) => item.id === customerId
  );

  if (!customer) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="mb-6">
        <Link
          href={`/customers/${customer.id}?asof=${encodeURIComponent(asof)}`}
          className="text-sm text-blue-600 hover:underline"
        >
          ← Back to Customer
        </Link>

        <h1 className="mt-3 text-2xl font-bold">Edit Customer</h1>

        <p className="mt-1 text-sm text-slate-500">
          Update customer master details.
        </p>
      </div>

      <CustomerForm
        asof={asof}
        customer={customer}
      />
    </main>
  );
}