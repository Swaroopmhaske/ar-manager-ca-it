import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const workspaceId = process.env.AR_WORKSPACE_ID;

if (!supabaseUrl || !supabaseAnonKey || !workspaceId) {
  throw new Error("Missing Supabase environment variables");
}

const db = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
  },
  global: {
    headers: {
      "x-workspace": workspaceId,
    },
  },
});

const tables = [
  "customers",
  "invoices",
  "credit_notes",
  "receipts",
  "allocations",
  "notes",
] as const;

async function main() {
  const snapshot: Record<string, unknown[]> = {};

  for (const table of tables) {
    const { data, error } = await db
      .from(table)
      .select("*")
      .order("id");

    if (error) {
      throw new Error(`${table}: ${error.message}`);
    }

    snapshot[table] = data ?? [];

    console.log(`${table}: ${data?.length ?? 0} records`);
  }

  mkdirSync("tests/fixtures", { recursive: true });

  writeFileSync(
    "tests/fixtures/sample.json",
    JSON.stringify(snapshot, null, 2),
    "utf8"
  );

  console.log("\nFixture created successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});