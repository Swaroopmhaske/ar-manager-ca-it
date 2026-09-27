import { dbQuery, supabase, AR_WORKSPACE_ID } from "@/lib/db";

type Customer = {
  id: string;
  code: string;
  name: string;
  city: string | null;
  state: string | null;
  credit_days: number;
  credit_limit: number;
  is_active: boolean;
};

export default async function Home() {
  const customers = await dbQuery<Customer[]>(
    supabase
      .from("customers")
      .select(
        "id, code, name, city, state, credit_days, credit_limit, is_active"
      )
      .eq("workspace_id", AR_WORKSPACE_ID)
      .order("code")
  );

  return (
    <main className="min-h-screen p-8">
      <h1 className="mb-2 text-3xl font-bold">AR Manager</h1>

      <p className="mb-8 text-gray-600">
        Brightwater Advisory Pvt. Ltd.
      </p>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-left">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">City</th>
              <th className="px-4 py-3">State</th>
              <th className="px-4 py-3">Credit Days</th>
              <th className="px-4 py-3">Credit Limit</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>

          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id} className="border-t">
                <td className="px-4 py-3">{customer.code}</td>
                <td className="px-4 py-3 font-medium">{customer.name}</td>
                <td className="px-4 py-3">{customer.city ?? "-"}</td>
                <td className="px-4 py-3">{customer.state ?? "-"}</td>
                <td className="px-4 py-3">{customer.credit_days}</td>
                <td className="px-4 py-3">
                  ₹{Number(customer.credit_limit).toLocaleString("en-IN")}
                </td>
                <td className="px-4 py-3">
                  {customer.is_active ? "Active" : "Inactive"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-sm text-gray-500">
        Workspace connection successful. Customers loaded: {customers.length}
      </p>
    </main>
  );
}