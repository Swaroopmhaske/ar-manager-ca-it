import Link from "next/link";

import { loadArData } from "@/lib/ar/load";
import { getAsOf } from "@/lib/asof";
import {
  creditLimitUsedPct,
  customerPosition,
} from "@/lib/ar/calculations";
import {
  formatAmount,
  formatBalance,
  formatDate,
} from "@/lib/ar/format";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{
    asof?: string;
    q?: string;
    status?: string;
  }>;
}) {
  const params = await searchParams;

  const asof = getAsOf(params.asof);
  const query = params.q?.trim().toLowerCase() ?? "";
  const statusFilter = params.status ?? "active";

  const data = await loadArData();

  const rows = data.customers
    .map((customer) => ({
      customer,
     position: customerPosition(
  data,
  customer.id,
  asof
),
    }))
    .filter(({ customer }) => {
      if (statusFilter === "active") {
        return customer.isActive;
      }

      if (statusFilter === "inactive") {
        return !customer.isActive;
      }

      return true;
    })
    .filter(({ customer }) => {
      if (!query) {
        return true;
      }

      return [
        customer.code,
        customer.name,
        customer.contactPerson,
        customer.email,
      ]
        .filter(
          (value): value is string =>
            Boolean(value)
        )
        .some((value) =>
          value.toLowerCase().includes(query)
        );
    });

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              Customer Master
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Customer positions as at {formatDate(asof)}
            </p>
          </div>

          <Link
            href={`/customers/new?asof=${asof}`}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Add customer
          </Link>
        </div>

        <form
          method="get"
          className="mb-6 flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm"
        >
          <input
            type="hidden"
            name="asof"
            value={asof}
          />

          <div>
            <label
              htmlFor="q"
              className="mb-1 block text-sm font-medium text-slate-600"
            >
              Search
            </label>

            <input
              id="q"
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Code, name, contact or email"
              className="w-72 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="status"
              className="mb-1 block text-sm font-medium text-slate-600"
            >
              Status
            </label>

            <select
              id="status"
              name="status"
              defaultValue={statusFilter}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="active">
                Active
              </option>

              <option value="inactive">
                Inactive
              </option>

              <option value="all">
                All
              </option>
            </select>
          </div>

          <button
            type="submit"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Apply
          </button>
        </form>

        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3">
                    Code
                  </th>

                  <th className="px-4 py-3">
                    Customer
                  </th>

                  <th className="px-4 py-3">
                    Location
                  </th>

                  <th className="px-4 py-3">
                    Contact
                  </th>

                  <th className="px-4 py-3 text-right">
                    Credit Days
                  </th>

                  <th className="px-4 py-3 text-right">
                    Credit Limit
                  </th>

                  <th className="px-4 py-3 text-right">
                    Balance
                  </th>

                  <th className="px-4 py-3 text-right">
                    Overdue
                  </th>

                  <th className="px-4 py-3 text-right">
                    Limit Used
                  </th>

                  <th className="px-4 py-3">
                    Status
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {rows.map(
                  ({ customer, position }) => {
                    const limitUsed =
                      creditLimitUsedPct(
                        position,
                        customer.creditLimit
                      );

                    return (
                      <tr
                        key={customer.id}
                        className="hover:bg-slate-50"
                      >
                        <td className="px-4 py-3 font-medium">
                          <Link
                            href={`/customers/${customer.id}?asof=${asof}`}
                            className="text-blue-700 hover:underline"
                          >
                            {customer.code}
                          </Link>
                        </td>

                        <td className="px-4 py-3">
                          {customer.name}
                        </td>

                        <td className="px-4 py-3">
                          {customer.city ?? "—"},{" "}
                          {customer.state ?? "—"}
                        </td>

                        <td className="px-4 py-3">
                          <div>
                            {customer.contactPerson ??
                              "—"}
                          </div>

                          <div className="text-xs text-slate-500">
                            {customer.email ?? "—"}
                          </div>
                        </td>

                        <td className="px-4 py-3 text-right">
                          {customer.creditDays}
                        </td>

                        <td className="px-4 py-3 text-right">
                          {formatAmount(
                            customer.creditLimit
                          )}
                        </td>

                        <td
                          className={`px-4 py-3 text-right font-medium ${
                            position.netBalance < 0
                              ? "text-emerald-700"
                              : ""
                          }`}
                        >
                          {formatBalance(
                            Math.abs(
                              position.netBalance
                            ),
                            position.netBalance >=
                              0
                              ? "Dr"
                              : "Cr"
                          )}
                        </td>

                        <td className="px-4 py-3 text-right">
                          {formatAmount(
                            position.overdue
                          )}
                        </td>

                        <td className="px-4 py-3 text-right">
                          {limitUsed}%
                        </td>

                        <td className="px-4 py-3">
                          {customer.isActive ? (
                            <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                              Active
                            </span>
                          ) : (
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                              Inactive
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  }
                )}
              </tbody>
            </table>
          </div>

          {rows.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500">
              No customers match the selected filters.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}