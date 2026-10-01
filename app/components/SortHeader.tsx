import Link from "next/link";

/**
 * A clickable column header. Clicking sorts by this column; clicking the
 * active column again flips the direction. Other query params are kept.
 */
export default function SortHeader({
  label,
  column,
  sort,
  dir,
  params,
  basePath,
  align = "left",
}: {
  label: string;
  column: string;
  sort: string;
  dir: "asc" | "desc";
  params: Record<string, string | undefined>;
  basePath: string;
  align?: "left" | "right";
}) {
  const active = sort === column;
  const nextDir = active && dir === "asc" ? "desc" : "asc";
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) query.set(k, v);
  query.set("sort", column);
  query.set("dir", nextDir);

  return (
    <th
      className={`px-3 py-3 ${align === "right" ? "text-right" : "text-left"}`}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <Link href={`${basePath}?${query.toString()}`} className="inline-flex items-center gap-1 hover:underline">
        {label}
        <span className={active ? "text-slate-900" : "text-slate-300"} aria-hidden>
          {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </Link>
    </th>
  );
}
