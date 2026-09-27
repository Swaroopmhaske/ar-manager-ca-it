"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

const navigation = [
  { label: "Dashboard", href: "/" },
  { label: "Customers", href: "/customers" },
  { label: "Invoices", href: "/invoices" },
  { label: "Receipts", href: "/receipts/new" },
];

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentAsOf = searchParams.get("asof") ?? "";

  const [asof, setAsOf] = useState(currentAsOf);

  function updateAsOf(value: string) {
    setAsOf(value);

    const params = new URLSearchParams(searchParams.toString());

    if (value) {
      params.set("asof", value);
    } else {
      params.delete("asof");
    }

    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <div>
          <Link
            href={`/?asof=${currentAsOf}`}
            className="text-xl font-bold text-slate-900"
          >
            AR Manager
          </Link>
          <p className="text-xs text-slate-500">
            Brightwater Advisory Pvt. Ltd.
          </p>
        </div>

        <nav className="flex items-center gap-2">
          {navigation.map((item) => {
            const href =
              currentAsOf
                ? `${item.href}?asof=${currentAsOf}`
                : item.href;

            const active =
              pathname === item.href ||
              (item.href === "/" && pathname === "/");

            return (
              <Link
                key={item.href}
                href={href}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${
                  active
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <label
            htmlFor="asof"
            className="text-sm font-medium text-slate-600"
          >
            As at
          </label>

          <input
            id="asof"
            type="date"
            value={asof}
            onChange={(event) => updateAsOf(event.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>
    </header>
  );
}