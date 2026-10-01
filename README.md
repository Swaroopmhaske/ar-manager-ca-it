# AR Manager — Brightwater Advisory Pvt. Ltd.

An accounts-receivable tool for an AR analyst: who owes the firm money, how late each payment is, and what to do about it. Built for the Verve Advisory build assignment; the full brief is in [`docs/BRIEF.md`](docs/BRIEF.md).

Every figure is calculated from the six source tables at a chosen **as-at date**, in whole paise. Nothing (no balance, no "amount paid") is stored or updated in place.

## What it does

| Area | Screens | Highlights |
|---|---|---|
| **Overdue at a glance** | `/` | Outstanding, unapplied credit, net receivable, overdue (and %), DSO, overdue count · ageing by customer with a **totals row** and click-through · overdue invoices in red, longest first, with Disputed / Part-paid labels · **Needs attention**: over limit, broken promises, follow-ups due, unapplied credit · ageing CSV |
| **Customer Master** | `/customers`, `/customers/new`, `/customers/[id]`, `/customers/[id]/edit`, `/customers/[id]/notes` | Search (code, name, contact, email), active/inactive filter, **sort by any column** · add / edit with validation · deactivate / reactivate · customer page with balance, ageing, over-limit warning, invoices, receipts and unapplied credit, notes timeline, quick actions |
| **Invoices** | `/invoices`, `/invoices/new`, `/invoices/[id]` | Filters: invoice number, customer, status (incl. **Cancelled**), disputed, date range · **sort by any column** (click again to reverse) · totals row (cancelled excluded) · CSV of the filtered list · create with live preview of number, due date, GST split and total, and a **non-blocking credit-limit warning** · credit note, disputed flag, cancel |
| **Receipts** | `/receipts`, `/receipts/new`, `/receipts/[id]/allocate` | Record a payment: TDS **pre-filled** (editable), open invoices with an **oldest-first suggestion** you can change, unapplied amount shown · receipt + allocations saved together · allocate unapplied credit later · **remove an allocation** · **delete a receipt** with no allocations |
| **Statement** | `/statement` (in the main menu) | Pick customer and period · opening balance, debits/credits, TDS as its own line, running balance, closing balance (Dr/Cr) · **footer: closing balance by ageing band + unapplied credit** · A4 print · CSV |

## Tech stack

Next.js (App Router, TypeScript) · Tailwind CSS · Supabase via `@supabase/supabase-js` (the shared, pre-loaded database) · zod for server-side validation · Vitest · Vercel. No other database, ORM or state library.

## Architecture

```
Browser ──► Next.js (server components + server actions) ──► Supabase (shared workspace)
                  │
                  └── lib/ar/  ← every financial calculation, plain functions, whole paise
```

- **`lib/db.ts`** is the only Supabase client. It is `server-only`, so it cannot be bundled into the browser, and it sends the `x-workspace` header.
- **`lib/ar/load.ts`** loads all six tables on each request and converts amounts to paise once.
- **`lib/ar/`** holds every calculation. Screens call these functions and display the results; they do not add up amounts themselves.

| File | What it owns |
|---|---|
| `calculations.ts` | R11 invoice position, R13 customer position, unapplied credit, R14 control (`controlCheck`, `balanceCheck`), R15 statement, R16 promises and follow-ups, R17 DSO, limit used |
| `ageing.ts` | The ageing bands (one list, used everywhere) and `bucketFor` |
| `documents.ts` | R2 due date, R3 GST split, R4 financial-year numbering |
| `drafts.ts` | New invoice / credit note: the figures the preview shows are the figures the save writes |
| `payments.ts` | Open invoices, TDS pre-fill, oldest-first suggestion, R6 allocation checks, receipt-delete rule |
| `lists.ts` | Invoice / customer / receipt lists: rows, filters, sorting, totals |
| `attention.ts` | Dashboard summary, overdue list, Needs attention, credit-limit check |
| `format.ts` | ₹ with Indian grouping, `31-Aug-2026` dates, Dr/Cr |

**Saving data.** Every form submits to a server action that validates with zod, checks the business rules with `lib/ar` (so the user gets a plain-language reason before the database is involved), writes, then revalidates. If the database still rejects a write, its message is shown.

**Receipt + allocations "saved together".** The Supabase API has no transactions across requests, and the brief does not allow database functions (§4.6, §4.8). So the server action checks every allocation first, inserts the receipt, then inserts **all** allocations in a single insert (one statement: all or none). If that fails, it deletes the receipt it just created and reports why. This happens on the server, not in the browser.

**Document numbers** come from the existing numbers in the same series and financial year, cancelled invoices included, so none is reused. If two tabs save at the same moment, the database rejects the duplicate and the action recalculates the number and retries once.

## Setup

You need Node.js (current LTS) and Git.

```bash
npm install
```

Create **`.env.local`** in the project root (it is git-ignored):

```
SUPABASE_URL=https://jxllwhrinqlzvydzrscs.supabase.co
SUPABASE_ANON_KEY=<the anon key from docs/BRIEF.md §3.1>
AR_WORKSPACE_ID=<your workspace id>
```

The workspace id comes from `create_workspace` (docs/BRIEF.md §3.2). None of these names start with `NEXT_PUBLIC_`, so they stay on the server. Never commit the workspace id: it is the key to your data.

## Running

| Task | Command |
|---|---|
| Development server | `npm run dev` → http://localhost:3000 |
| Tests | `npm test` |
| Lint | `npm run lint` |
| Type-check | `npx tsc --noEmit` |
| Production build | `npm run build` (needs the three variables) |
| Refresh the test fixture | Reset the workspace (docs/BRIEF.md §3.2), then `node --env-file=.env.local scripts/snapshot.ts` |

The fixture (`tests/fixtures/sample.json`) is the sample data saved once, with `workspace_id` stripped out, so the tests run offline and do not change when test records are added to the workspace.

## Tests

161 Vitest tests in `tests/`, all against the sample-data fixture:

- every published spot check (with spot check 3's bucket under the new bands, see below);
- `balanceCheck` is empty **for every day** from 2026-01-01 to 2026-10-31, and ageing buckets add up to outstanding for every customer on every one of those days;
- every statement's closing balance equals the R14 document balance;
- GST split and due date reproduce the stored values of **every** sample invoice; ₹1,000.05 gives CGST ₹90.00 + SGST ₹90.00;
- numbering (next numbers after the sample data, new financial year, cancelled numbers not reused, ≤ 16 characters);
- ageing boundaries 0/1/15/16/30/31/45/46/90/91;
- cancelled invoices: listed and filterable, excluded from balances, ageing, statements, DSO and dashboard;
- every invoice and customer column sorts both ways;
- credit-limit warning: below, exactly at, above, with unapplied credit;
- payments: TDS pre-fill reproduces the real sample receipts (e.g. ₹5,72,400 → ₹53,000), oldest-first suggestion, every R6 check, delete only without allocations;
- Tamhini terms change: existing due dates unchanged, new invoices at 45 days;
- formatting, CSV quoting and BOM, statement period defaults.

The click-through checks are in [`docs/TESTING.md`](docs/TESTING.md).

## As-at date

Every page reads `?asof=YYYY-MM-DD` (`lib/asof.ts`). If missing or invalid, it is **today in Asia/Kolkata**, worked out with `Intl` so a UTC server is not a day behind before 05:30 IST. The header date picker updates the URL and every menu link keeps it. Dates stay as `YYYY-MM-DD` strings; day counts use `Date.UTC`, never local time.

## Design decisions

**Limit used = net balance ÷ credit limit.** R13 defines *over limit* as net balance (invoice outstanding minus unapplied credit) above the limit, so "limit used" is measured on the same figure, and the two can never disagree: a customer is over 100% exactly when flagged over limit. Money the customer has already paid us but that is not yet matched to an invoice is real cash held, so it reduces exposure. A credit (Cr) balance uses 0% of the limit.

*Sabarmati (C005) at 31-Aug-2026:* gross outstanding ₹1,88,800 would read 76%, but we already hold their ₹1,00,000 advance, so the net balance is ₹88,800 and limit used is **36%**. A credit controller deciding whether to ship more work on credit cares about what the customer would still owe us, which is ₹88,800. The gross outstanding and the unapplied credit are both still shown beside it, so nothing is hidden.

**The credit-limit warning** compares the net balance *as at the new invoice's date* plus the new invoice total with the limit. Exactly at the limit is not a breach (R13 says "above"). It warns and the button becomes **Save anyway**; it never blocks.

**TDS pre-fill.** TDS is the customer's rate on the taxable value (R5). A customer settling an invoice in full pays (open amount − TDS) by bank, so the bank amount is applied oldest first against each invoice's cash due: fully covered invoices contribute their full TDS, a part-covered one a proportional share, and any excess (an advance) carries no TDS. Taxable value is taken net of credit notes. It is only a pre-fill; what the user enters is saved.

**What counts as "open" for a new allocation** is total − *all* allocations − *all* credit notes, whatever their dates, because R6's limit applies to every record. (So as at 31-Aug, Sabarmati's advance shows as unapplied, but it cannot be allocated again because the sample data already allocates it on 05-Sep.)

**Credit notes** use their invoice's GST rate *and split* (R7), even if the customer's state has changed since.

**Payments for inactive customers** are allowed: R9 only stops new invoices, and a deactivated customer may still pay.

## Client-requested changes

1. **New ageing bands.** Replaces the brief's R12 bands everywhere (calculations, dashboard, customer page, statement footer, CSV, tests):

   | Band | Days past due |
   |---|---|
   | Not due | 0 or fewer |
   | 1-15 | 1 to 15 |
   | 16-30 | 16 to 30 |
   | 31-45 | 31 to 45 |
   | 46-90 | 46 to 90 |
   | Over 90 | 91 or more |

   The bands are defined once, in `lib/ar/ageing.ts`. **Effect on the brief's spot check 3:** BWA/26-27/0003 at 31-Aug-2026 is 90 days past due, which is now **46-90** (the brief's bands said 61–90). Its outstanding, status and days late are unchanged.

2. **Tamhini Foods (C001) terms 30 → 45 days.** A data change, made through *Customers → C001 → Edit customer* (see docs/TESTING.md). Due dates are stored on each invoice when it is created (R2) and the database does not allow invoice edits, so existing C001 invoices keep their 30-day due dates; only invoices created after the change use 45 days. A regression test proves both. Note that resetting the workspace restores the sample data, including 30 days for C001.

## Assumptions

- The as-at date filters by each record's own date (R10); allocations dated after D do not count at D even when their receipt is earlier.
- The statement period defaults to 1 April of the as-at date's financial year through the as-at date.
- Statement and ageing CSVs carry a short header block (seller, customer, period) above the table; amounts are plain numbers.
- The invoice list search matches the invoice number only, as Part 2 specifies; the customer filter covers search by customer.

## Known gaps

- **Not run against the live database in this round.** All logic is unit-tested and every page was rendered against the sample fixture, but saving (invoices, receipts, allocations, credit notes, deletes) must be checked on the real workspace with docs/TESTING.md.
- **The workspace id was committed earlier** in `tests/fixtures/sample.json` (now removed, but still in git history). Create a new workspace, put its id in `.env.local` and Vercel, and submit that id.
- No automated browser (end-to-end) tests; the UI is checked manually.
- The invoice list's "Received" column is allocations as at D (as specified); it does not show unapplied money waiting for that customer (the customer page does).

## What I would do next

- Playwright end-to-end tests for the payment, allocation and correction flows against a throwaway workspace.
- Server-side pagination if the data grows well beyond the sample size (everything is loaded per request by design today).
- An audit trail of corrections (who removed which allocation, when).

## Deployment

Deployed on Vercel from the `master` branch; each push deploys. In Vercel → Settings → Environment Variables, set `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `AR_WORKSPACE_ID`, then redeploy (variables only apply to new deployments). Live site: https://ar-manager-ca-it.vercel.app
