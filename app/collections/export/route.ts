import { loadArData } from "@/lib/ar/load";
import { getAsOf } from "@/lib/asof";
import {
  WORKLIST_CSV_HEADER,
  WORKLIST_SORTS,
  collectionItems,
  filterWorklist,
  sortWorklist,
  worklistCsvRows,
  worklistFilterFromParams,
  type WorklistSort,
} from "@/lib/ar/collections";
import { csvResponse, toCsv } from "@/lib/csv";

/** The collections worklist exactly as filtered and sorted on screen. */
export async function GET(request: Request) {
  const p = Object.fromEntries(new URL(request.url).searchParams.entries());
  const asOf = getAsOf(p.asof);
  const sort: WorklistSort = WORKLIST_SORTS.includes(p.sort as WorklistSort) ? (p.sort as WorklistSort) : "priority";

  const data = await loadArData();
  const items = sortWorklist(filterWorklist(collectionItems(data, asOf), worklistFilterFromParams(p)), sort);

  const csv = toCsv([["Collections worklist as at", asOf], [], [...WORKLIST_CSV_HEADER], ...worklistCsvRows(items)]);
  return csvResponse(csv, `Collections_${asOf}.csv`);
}
