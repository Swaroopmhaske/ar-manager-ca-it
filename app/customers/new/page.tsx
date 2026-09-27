import Link from "next/link";
import CustomerForm from "../CustomerForm";

export default async function NewCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ asof?: string }>;
}) {
  const params = await searchParams;
  const asof = params.asof ?? "";

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="mb-6">
        <Link
          href={`/customers?asof=${encodeURIComponent(asof)}`}
          className="text-sm text-blue-600 hover:underline"
        >
          ← Back to Customers
        </Link>

        <h1 className="mt-3 text-2xl font-bold">Add Customer</h1>
        <p className="mt-1 text-sm text-slate-500">
          Create a new customer record.
        </p>
      </div>

      <CustomerForm asof={asof} />
    </main>
  );
}