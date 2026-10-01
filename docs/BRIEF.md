# AR Manager

**Build assignment · Verve Advisory**

Build a working **AR Manager**: the tool an accounts receivable analyst at a services firm uses every day to see who owes the firm money, how late each payment is, and what to do about it.

This repository is empty apart from this file. The sample data is already loaded in a shared database, ready for you to use (Part 3). You build everything else from scratch: the calculations, the screens and the deployment.

**How this brief is weighted.** You already know receivables, so Part 1 states the business rules briefly, as a specification. Part 4, the technical build guide, is the long part. It prescribes the stack, how to work with the shared database, where the calculations live, testing and deployment, and walks you through setup one step at a time. You are expected to build with an AI coding assistant. The brief is written so that you can hand it to one section by section, but you remain responsible for every figure the tool shows.

---

## Contents

- **Part 0**: The short version
- **Part 1**: Business rules
- **Part 2**: What to build
- **Part 3**: The sample data and the shared database
- **Part 4**: Technical build guide
- **Part 5**: Build order
- **Part 6**: Submitting, and how we evaluate

---

## Part 0: The short version

| Area | What it does |
|---|---|
| **Customer Master** | Every customer, with their contact details and credit terms. Searchable. |
| **Invoices** | Every invoice with its status (paid, due or overdue). Sortable and filterable. |
| **Overdue at a glance** | Late invoices flagged in red, showing days late and amount outstanding, grouped into ageing buckets. |
| **Actions** | Record a payment, add a note, and print or export a statement. |

Your tool works on the sample data already loaded in the shared database (Part 3). Every amount the tool shows must be correct to the paisa **as at any date the user picks**. We will check your figures against our own calculation.

**The stack is fixed:** Next.js (TypeScript) hosted on Vercel, working with the shared Supabase database. Part 4 explains why.

---

## Part 1: Business rules

The seller is **Brightwater Advisory Pvt. Ltd.**, Baner, Pune 411045, **Maharashtra**, a fictional advisory firm. All amounts are in INR.

Where an example uses a document number, it comes from the Part 3 sample data.

### Documents and derived fields

**R1. Records.** There are five kinds of record: customer, invoice, credit note, receipt (with its allocations) and note. Every figure the tool shows is calculated from these. **Never store a running balance or an "amount paid" field that you update in place.** The as-at rule (R10) makes that impossible to keep correct.

**R2. Due date** = invoice date + the customer's `credit_days`, counted in calendar days. It is calculated and stored when the invoice is created. A later change to the customer's terms does not change existing invoices.

**R3. GST.** The rate is 18%. If the customer's `state` is `Maharashtra`, charge CGST and SGST at half the rate each; otherwise charge IGST at the full rate. Round each component to 2 decimals, halves up. **Invoice total = taxable value + GST.** Once created, an invoice is not edited, apart from its description and its disputed flag.

**R4. Numbering.** Numbers are per Indian financial year (April to March) and restart each 1 April. None is ever reused, including the numbers of cancelled invoices. Invoice numbers must be no longer than 16 characters (GST Rule 46).

| Series | Format | Next number after the sample data |
|---|---|---|
| Invoice | `BWA/YY-YY/NNNN` | `BWA/26-27/0025` |
| Credit note | `BWA/CN/YY-YY/NNN` | `BWA/CN/26-27/002` |
| Receipt | `RCT/YY-YY/NNNN` | `RCT/26-27/0018` |

FY 2025-26 invoices were carried over from the firm's old system and keep their original numbers.

### Receipts and adjustments

**R5. TDS counts as payment.** A receipt has a `bank_amount` and a `tds_amount`. Its **settlement value = bank + TDS**, and that is what settles invoices. The customer's `tds_rate_pct` (applied to the taxable value, not the total) only pre-fills the expected TDS. Always save what the customer actually deducted.

**R6. Allocation.** An allocation links one receipt to one invoice of the **same customer**, and has its own `allocation_date`. The rules:

- The allocations from one receipt cannot exceed its settlement value.
- An invoice's allocations plus its credit notes cannot exceed its total.
- Nothing can be allocated to a cancelled invoice.
- The allocation date cannot be earlier than the receipt date or the invoice date.

When a payment is being recorded, suggest allocating it oldest first, by due date and then invoice number; the user can change the suggestion. Anything not allocated remains **unapplied credit**, which can be allocated later. An allocation can be removed. A receipt with no allocations can be deleted.

**R7. Credit notes** reduce a specific invoice from the credit note's date onwards. GST is calculated on the credit note's taxable value with the invoice's rate and split. The same limit as R6 applies: allocations plus credit notes cannot exceed the invoice total.

**R8. Cancellation.** A cancelled invoice keeps its number, appears in the invoice list with the status Cancelled, and is left out of every total, balance, ageing figure, statement and DSO calculation. An invoice can be cancelled only if nothing has been allocated or credited against it.

**R9. Customers.** Inactive customers cannot be given new invoices. A customer with any records cannot be deleted, only deactivated. When a new invoice would take a customer's net balance above its credit limit, **warn** the user but do not block them.

### Positions as at a date

**R10. As-at date.** Every screen respects an as-at date D, which defaults to today in Asia/Kolkata. Only records dated on or before D exist: invoices by `invoice_date`, receipts by `receipt_date`, credit notes by `credit_note_date`, allocations by `allocation_date`, and notes by `note_date`.

**R11. Invoice position** as at D, for an invoice that is not cancelled and has `invoice_date ≤ D`:

```
received      = Σ allocations to the invoice with allocation_date ≤ D
credited      = Σ credit-note totals against the invoice with credit_note_date ≤ D
outstanding   = total − received − credited
days_past_due = D − due_date
status        = Paid     if outstanding = 0
                Overdue  if outstanding > 0 and days_past_due ≥ 1
                Due      otherwise          (an invoice is still "Due" on its due date)
part-paid     = outstanding > 0 and received + credited > 0     (a label shown with the status)
disputed      = the invoice's flag                               (a label; changes no amount)
```

**R12. Ageing buckets** are based on days past due (from the due date, not the invoice date), for invoices with an outstanding amount above zero:

| Bucket | Days past due |
|---|---|
| Not due | 0 or fewer |
| 1–30 | 1 to 30 |
| 31–60 | 31 to 60 |
| 61–90 | 61 to 90 |
| 91–180 | 91 to 180 |
| Over 180 | 181 or more |

**R13. Customer position** as at D:

- **Unapplied credit** = Σ settlement values of the customer's receipts dated ≤ D, minus Σ allocations from those receipts dated ≤ D.
- **Net balance** = Σ invoice outstanding − unapplied credit. A negative figure is a credit balance, shown as **Cr**.
- **Overdue** = Σ invoice outstanding − the Not due bucket.
- **Over limit** when net balance > credit limit.

Show unapplied credit in its own column. **Do not net it off against the oldest bucket.**

**R14. The control check.** For every customer and every date, net balance (R13) must equal:

```
Σ totals of non-cancelled invoices dated ≤ D
− Σ credit-note totals dated ≤ D
− Σ receipt settlement values dated ≤ D
```

Build this check into your calculation module and run it in your tests (sections 4.7 and 4.14).

**R15. Statement of account** for a customer from F to T:

- **Opening balance** = the R14 balance as at F − 1.
- **Lines:** each invoice is a debit of its total, each credit note a credit of its total, and each receipt a credit of its bank amount ("Payment received"). The TDS on a receipt is a separate credit line ("TDS deducted by you"), included only when TDS is above zero.
- **Order:** by date. Lines on the same date go invoices, then credit notes, then receipts, then TDS lines, then by document number.
- **Running balance**, and a **closing balance** that equals the R14 balance as at T.
- **Left out:** cancelled invoices, allocations and notes.
- **Footer:** the closing balance by ageing bucket, and any unapplied credit.

**R16. Notes.** Each note has a date, customer, optional invoice, a type (Call, Email, Meeting or Note), the text, an optional follow-up date (with a done flag), and an optional promise to pay (a date and amount, both or neither).

- **Follow-ups due** as at D: notes with `follow_up_date ≤ D` that are not marked done.
- **Promise status** as at D (only notes with `note_date ≤ D` are considered):

| Status | Condition |
|---|---|
| **Kept** | Σ settlement values of the customer's receipts dated from `note_date` to `min(promise_date, D)` ≥ `promise_amount` |
| **Broken** | Not kept, and `promise_date < D` |
| **Pending** | Otherwise |

**R17. DSO** as at D, rounded to the nearest whole day:

```
DSO = Σ invoice outstanding (before unapplied credit) ÷ S × 90

S   = Σ totals of non-cancelled invoices dated D−89 … D
    − Σ credit-note totals dated in the same window
```

When S = 0, show "—".

**R18. Formats.** Show amounts as `₹1,23,456.00` (Indian digit grouping) and dates as `31-Aug-2026`. Balances carry a `Dr` or `Cr` suffix.

### Spot checks

Use these to test your build as you go. The full set of checks we evaluate with is not published.

| # | Check | Expected |
|---|---|---|
| 1 | BWA/26-27/0001 (C001, Maharashtra) | CGST 6,750.00 + SGST 6,750.00, total 88,500.00, due 05-May-2026 |
| 2 | BWA/26-27/0002 (C007, Telangana) | IGST 63,000.00, total 4,13,000.00 |
| 3 | BWA/26-27/0003 as at 31-Aug-2026 | Outstanding 69,600.00, Overdue · part-paid, 90 days late, bucket **61–90** |
| 4 | BWA/26-27/0021 as at 31-Aug / 06-Sep / 15-Sep-2026 | Due 88,500.00 / Overdue 2 days, 88,500.00 / Paid |
| 5 | C005 as at 31-Aug-2026 | Outstanding 1,88,800.00, unapplied 1,00,000.00, net 88,800.00 Dr |
| 6 | C005 as at 12-Jul-2026 | Net 1,00,000.00 **Cr** (advance received, invoice not yet raised) |
| 7 | BWA/26-27/0007 as at 31-Aug-2026 | Outstanding 3,000.00 (credit note 29,500.00; receipt 2,40,000.00 + 22,500.00 TDS) |
| 8 | Statement C002, 01-Apr-2026 to 31-Aug-2026 | Opening 70,800.00 Dr, closing 2,23,000.00 Dr, 7 lines |
| 9 | Promise noted by C002 on 20-Jul-2026, as at 31-Aug-2026 | Broken |
| 10 | Control check (R14), any date | No differences for any customer |

---

## Part 2: What to build

**Across the app:**

- An **as-at date picker** in the header, defaulting to today in India. Keep the date in the URL (`?asof=2026-08-31`) so views can be bookmarked and shared.
- Navigation between the four areas.

**Customer Master** (`/customers`, `/customers/new`, `/customers/[id]`, `/customers/[id]/edit`)

- **List:** code, name, city and state, contact person, credit days, credit limit, balance and overdue amount as at D, percentage of the credit limit used, and status. Search by code, name, contact or email. Filter active or inactive. Sort by any column.
- **Add and edit**, with validation: required fields, a unique code, a valid email, credit days ≥ 0, a credit limit ≥ 0, and a TDS rate from 0 to 100. A 15-character GSTIN is optional.
- **Deactivate and reactivate** (R9).
- **Customer page:** profile, balance with a one-line ageing breakdown, over-limit warning, invoices, receipts with any unapplied credit, a timeline of notes, and quick actions.

**Invoices** (`/invoices`, `/invoices/new`, `/invoices/[id]`)

- **List**, as at D: number, customer, invoice date, due date, total, received, credited, outstanding, status, days late, and the part-paid and disputed labels.
- **Filter** by customer, status (including Cancelled), disputed and date range. Search by number. Sort by any column. Show a totals row for the filtered list.
- **Create:** choose an active customer, then enter the date, description, taxable value and GST rate. Before saving, preview the tax split, total, due date and next number, and show the credit-limit warning (R9).
- **Invoice page:** tax breakdown, allocations, credit notes, notes and outstanding as at D. Actions: raise a credit note, set or clear the disputed flag, and cancel (R8).

**Overdue at a glance** (`/`, the home screen)

- **Summary figures** as at D: total outstanding on invoices, unapplied credit, net receivable, overdue amount (and its percentage of total outstanding), DSO, and the number of overdue invoices.
- **Ageing by customer** with a totals row and click-through to the underlying invoices.
- **Overdue invoices:** red rows, sorted by days late with the longest first, showing the disputed label.
- **Needs attention:** customers over their limit, broken promises, follow-ups due, and unapplied credit waiting to be allocated.

**Actions**

1. **Record a payment** (`/receipts/new`). Enter the customer, date, bank amount, TDS (pre-filled), mode (NEFT, RTGS, IMPS, UPI or Cheque) and reference. The form shows the customer's open invoices with an oldest-first suggestion the user can edit, and the amount that will remain unapplied. The receipt and its allocations are saved together: if the allocations cannot be saved, the receipt is not kept either (section 4.8).
2. **Allocate unapplied credit** from the customer page, with an allocation date.
3. **Raise a credit note** from the invoice page.
4. **Add a note**, and mark follow-ups as done.
5. **Statement of account** (`/statement?customer=…&from=…&to=…`). Show it on screen, with **print** (a clean A4 layout) and **CSV export**.
6. **CSV export** of the invoice list and the ageing report.
7. **Corrections:** remove an allocation, delete a receipt that has no allocations, and cancel an invoice.

**Not in scope:** other currencies, GST returns or e-invoicing, sending email, provisioning or write-offs, user roles, and editing the seller's details.

---

## Part 3: The sample data and the shared database

All companies, people and amounts are fictional. The seller is **Brightwater Advisory Pvt. Ltd.**, Baner, Pune 411045, **Maharashtra**.

The sample data is **already loaded** in a shared **Supabase** database: a hosted PostgreSQL database that comes with a ready-made web API. You do not create a database, tables or any data. The schema is fixed and is the same for every candidate. Every record in the sample data is there for a reason.

### 3.1 Connection details

| | |
|---|---|
| **Project URL** | `https://jxllwhrinqlzvydzrscs.supabase.co` |
| **API key** (anon) | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4bGx3aHJpbnFsenZ5ZHpyc2NzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3NDU2ODQsImV4cCI6MjEwNTMyMTY4NH0.a6878sV1NRsNWpT32z9pty0lB4SQB-ofQI2yxogSwTg` |

This key is public by design. It can reach only your own workspace (section 3.2).

### 3.2 Your workspace: your own copy of the data

Every candidate works on a private copy of the sample data, called a **workspace**, so no one can see or change anyone else's work.

**1. Create your workspace, once**, with your full name. In a terminal (macOS or Linux; on Windows, use Git Bash):

```bash
export SUPABASE_URL=https://jxllwhrinqlzvydzrscs.supabase.co
export SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4bGx3aHJpbnFsenZ5ZHpyc2NzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3NDU2ODQsImV4cCI6MjEwNTMyMTY4NH0.a6878sV1NRsNWpT32z9pty0lB4SQB-ofQI2yxogSwTg

curl -X POST "$SUPABASE_URL/rest/v1/rpc/create_workspace" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"p_label": "Your Full Name"}'
```

It returns your **workspace id**, a value like `"3f2b8c1e-…"`. Keep it, and do not share it with anyone.

**2. Every request sends it** in an `x-workspace` header. The client in section 4.5 does this for you. Without the header, every request fails with *"Missing x-workspace header"*.

**3. Reset whenever you like.** Resetting deletes everything in your workspace and reloads the original sample data:

```bash
curl -X POST "$SUPABASE_URL/rest/v1/rpc/reset_workspace" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "x-workspace: YOUR-WORKSPACE-ID" \
  -H "Content-Type: application/json" -d '{}'
```

Reset before checking your figures against the spot checks, because payments and invoices you create while testing change the figures.

### 3.3 The tables

Every table also has an `id` (a number the database assigns), a `workspace_id` (filled in automatically: never send it) and a `created_at` timestamp.

| Table | Columns |
|---|---|
| `customers` | `code`, `name`, `city`, `state`, `contact_person`, `email`, `phone`, `gstin`, `credit_days`, `credit_limit`, `tds_rate_pct`, `is_active` |
| `invoices` | `invoice_no`, `customer_id` (→ `customers.id`), `invoice_date`, `due_date`, `description`, `taxable_value`, `gst_rate_pct`, `cgst`, `sgst`, `igst`, `total`, `is_cancelled`, `is_disputed` |
| `credit_notes` | `credit_note_no`, `invoice_id` (→ `invoices.id`), `credit_note_date`, `taxable_value`, `cgst`, `sgst`, `igst`, `total`, `reason` |
| `receipts` | `receipt_no`, `customer_id`, `receipt_date`, `bank_amount`, `tds_amount`, `mode` (`NEFT`, `RTGS`, `IMPS`, `UPI` or `Cheque`), `reference` |
| `allocations` | `receipt_id` (→ `receipts.id`), `invoice_id`, `allocation_date`, `amount` |
| `notes` | `customer_id`, `invoice_id` (optional), `note_date`, `note_type` (`Call`, `Email`, `Meeting` or `Note`), `body`, `follow_up_date`, `follow_up_done`, `promise_date`, `promise_amount` |

**Stored, not calculated:** `due_date`, `cgst`, `sgst`, `igst` and `total` are stored on each invoice and credit note. They are already filled in for the sample data. When your tool creates an invoice or a credit note, it must calculate these values (R2, R3, R7) and send them.

### 3.4 What the database does, and what it does not

**It rejects data that would corrupt your workspace:**

- an invoice or credit note whose total is not its taxable value plus GST, or that mixes IGST with CGST and SGST,
- editing an invoice after it has been created (only `description` and `is_disputed` can change),
- cancelling an invoice that has payments or credit notes against it, or reinstating a cancelled one,
- deleting a customer, invoice or credit note,
- any allocation that breaks R6,
- a credit note larger than what is outstanding on its invoice,
- deleting a receipt that still has allocations,
- reusing a document number.

A rejected request returns an error with a `message` explaining why. **Treat the database as a safety net, not as your validation.** Your tool should check input before saving it (section 4.8) and explain any problem in plain language.

**It calculates nothing.** Every figure in R10 to R17, and the next document numbers, is for your code to work out (section 4.7). You cannot create tables, database functions or triggers.

### 3.5 The same data as CSV, for reference

This is the data every workspace starts with. The CSVs leave out due dates, GST amounts and totals, which the database stores (section 3.3).

Dates are in `YYYY-MM-DD` format. Amounts are in rupees with 2 decimal places.

#### customers.csv

```csv
customer_code,name,city,state,contact_person,email,credit_days,credit_limit,tds_rate_pct,is_active
C001,Tamhini Foods Pvt. Ltd.,Pune,Maharashtra,Neha Joshi,accounts@tamhinifoods.example,30,500000.00,10,yes
C002,Varandha Freight LLP,Mumbai,Maharashtra,Rohan Kulkarni,payables@varandhafreight.example,45,300000.00,10,yes
C003,Kundalika Castings Pvt. Ltd.,Bengaluru,Karnataka,Suresh Rao,finance@kundalikacastings.example,30,400000.00,10,yes
C004,Pawana Healthcare Pvt. Ltd.,Pune,Maharashtra,Dr. Anita Deshpande,ap@pawanahealth.example,60,600000.00,10,yes
C005,Sabarmati Retail Ventures Pvt. Ltd.,Ahmedabad,Gujarat,Kiran Patel,accounts@sabarmatiretail.example,30,250000.00,10,yes
C006,Mulshi Agro Producers,Pune,Maharashtra,Ganesh Pawar,mulshiagro@example.com,15,100000.00,0,yes
C007,Krishnaveni Infra Projects Ltd.,Hyderabad,Telangana,Lakshmi Reddy,ap@krishnaveniinfra.example,45,800000.00,10,yes
C008,Kamshet Hospitality Pvt. Ltd.,Lonavala,Maharashtra,Farhan Shaikh,accounts@kamshethospitality.example,30,200000.00,10,no
```

#### invoices.csv

```csv
invoice_no,customer_code,invoice_date,description,taxable_value,gst_rate_pct,is_cancelled,is_disputed
BWA/25-26/0141,C003,2026-01-20,"Cost audit support, Q3",150000.00,18,no,no
BWA/25-26/0156,C003,2026-02-25,Inventory valuation review,90000.00,18,no,no
BWA/25-26/0162,C002,2026-03-10,GST annual return filing,60000.00,18,no,no
BWA/25-26/0170,C004,2026-03-28,"Internal audit, H2 FY25-26",200000.00,18,no,no
BWA/25-26/0171,C008,2026-03-30,Tax audit report,45000.00,18,no,no
BWA/26-27/0001,C001,2026-04-05,"Monthly accounting retainer, Apr",75000.00,18,no,no
BWA/26-27/0002,C007,2026-04-10,"Project finance model, phase 1",350000.00,18,no,no
BWA/26-27/0003,C002,2026-04-18,Transfer pricing documentation,120000.00,18,no,no
BWA/26-27/0004,C003,2026-04-25,Costing system redesign,110000.00,18,no,no
BWA/26-27/0005,C006,2026-04-28,"Bookkeeping, Q4 FY25-26",25000.00,18,no,no
BWA/26-27/0006,C001,2026-05-05,"Monthly accounting retainer, May",75000.00,18,no,no
BWA/26-27/0007,C004,2026-05-12,Hospital billing process audit,250000.00,18,no,no
BWA/26-27/0008,C007,2026-05-15,"Project finance model, phase 2",180000.00,18,no,no
BWA/26-27/0009,C002,2026-05-22,Customs duty refund advisory,80000.00,18,no,no
BWA/26-27/0010,C004,2026-06-01,Finance team workshop,40000.00,18,no,yes
BWA/26-27/0011,C001,2026-06-05,"Monthly accounting retainer, Jun",75000.00,18,no,no
BWA/26-27/0012,C006,2026-06-15,"Bookkeeping, Q1 FY26-27",25000.00,18,no,no
BWA/26-27/0013,C003,2026-06-28,Plant-wise profitability MIS,70000.00,18,no,no
BWA/26-27/0014,C007,2026-07-01,Lender due diligence (raised in error),200000.00,18,yes,no
BWA/26-27/0015,C007,2026-07-02,Lender due diligence,400000.00,18,no,no
BWA/26-27/0016,C001,2026-07-05,"Monthly accounting retainer, Jul",75000.00,18,no,no
BWA/26-27/0017,C005,2026-07-15,Store-level P&L setup,100000.00,18,no,no
BWA/26-27/0018,C002,2026-07-20,Freight cost benchmarking,50000.00,18,no,no
BWA/26-27/0019,C004,2026-07-30,Revenue cycle review,300000.00,18,no,no
BWA/26-27/0020,C006,2026-08-01,"Bookkeeping, Jul",30000.00,18,no,no
BWA/26-27/0021,C001,2026-08-05,"Monthly accounting retainer, Aug",75000.00,18,no,no
BWA/26-27/0022,C005,2026-08-20,Inventory shrinkage study,60000.00,18,no,no
BWA/26-27/0023,C007,2026-08-25,Lenders' engineer liaison,220000.00,18,no,no
BWA/26-27/0024,C001,2026-09-05,"Monthly accounting retainer, Sep",75000.00,18,no,no
```

#### credit_notes.csv

```csv
credit_note_no,invoice_no,credit_note_date,taxable_value,reason
BWA/CN/26-27/001,BWA/26-27/0007,2026-07-25,25000.00,Scope reduced: one hospital unit dropped from audit
```

#### receipts.csv

```csv
receipt_no,customer_code,receipt_date,bank_amount,tds_amount,mode,reference
RCT/26-27/0001,C008,2026-04-25,48600.00,4500.00,NEFT,UTR 0425-7781
RCT/26-27/0002,C003,2026-04-30,40000.00,9000.00,RTGS,UTR 0430-1102
RCT/26-27/0003,C001,2026-05-03,81000.00,7500.00,NEFT,UTR 0503-3310
RCT/26-27/0004,C006,2026-05-10,29500.00,0.00,UPI,UPI 0510-8842
RCT/26-27/0005,C002,2026-05-20,64800.00,6000.00,NEFT,UTR 0520-4471
RCT/26-27/0006,C001,2026-06-02,81000.00,7500.00,NEFT,UTR 0602-3316
RCT/26-27/0007,C002,2026-06-15,60000.00,12000.00,NEFT,UTR 0615-4490
RCT/26-27/0008,C004,2026-06-20,216000.00,20000.00,RTGS,UTR 0620-9021
RCT/26-27/0009,C007,2026-06-25,572400.00,53000.00,RTGS,UTR 0625-6650
RCT/26-27/0010,C001,2026-07-08,81000.00,7500.00,NEFT,UTR 0708-3321
RCT/26-27/0011,C005,2026-07-10,90000.00,10000.00,NEFT,UTR 0710-5503
RCT/26-27/0012,C006,2026-07-20,29500.00,0.00,Cheque,Chq 004512
RCT/26-27/0013,C004,2026-08-14,240000.00,22500.00,RTGS,UTR 0814-9077
RCT/26-27/0014,C001,2026-08-20,81000.00,7500.00,NEFT,UTR 0820-3334
RCT/26-27/0015,C007,2026-09-08,432000.00,40000.00,RTGS,UTR 0908-6681
RCT/26-27/0016,C002,2026-09-09,86400.00,8000.00,NEFT,UTR 0909-4512
RCT/26-27/0017,C001,2026-09-10,81000.00,7500.00,NEFT,UTR 0910-3340
```

#### allocations.csv

```csv
receipt_no,invoice_no,allocation_date,amount
RCT/26-27/0001,BWA/25-26/0171,2026-04-25,53100.00
RCT/26-27/0002,BWA/25-26/0156,2026-04-30,49000.00
RCT/26-27/0003,BWA/26-27/0001,2026-05-03,88500.00
RCT/26-27/0004,BWA/26-27/0005,2026-05-10,29500.00
RCT/26-27/0005,BWA/25-26/0162,2026-05-20,70800.00
RCT/26-27/0006,BWA/26-27/0006,2026-06-02,88500.00
RCT/26-27/0007,BWA/26-27/0003,2026-06-15,72000.00
RCT/26-27/0008,BWA/25-26/0170,2026-06-20,236000.00
RCT/26-27/0009,BWA/26-27/0002,2026-06-25,413000.00
RCT/26-27/0009,BWA/26-27/0008,2026-06-25,212400.00
RCT/26-27/0010,BWA/26-27/0011,2026-07-08,88500.00
RCT/26-27/0012,BWA/26-27/0012,2026-07-20,29500.00
RCT/26-27/0013,BWA/26-27/0007,2026-08-14,262500.00
RCT/26-27/0014,BWA/26-27/0016,2026-08-20,88500.00
RCT/26-27/0011,BWA/26-27/0017,2026-09-05,100000.00
RCT/26-27/0015,BWA/26-27/0015,2026-09-08,472000.00
RCT/26-27/0016,BWA/26-27/0009,2026-09-09,94400.00
RCT/26-27/0017,BWA/26-27/0021,2026-09-10,88500.00
```

#### notes.csv

Every follow-up in this file is still open (not marked as done).

```csv
note_date,customer_code,invoice_no,type,text,follow_up_date,promise_date,promise_amount
2026-07-10,C005,,Note,Advance received before the engagement started. Allocate it once the invoice is raised.,,,
2026-07-20,C002,BWA/26-27/0003,Call,Spoke to Rohan in payables. Balance of this invoice promised by 1 Aug.,,2026-08-01,69600.00
2026-07-26,C004,BWA/26-27/0010,Email,Customer disputes the workshop invoice: says the second session was not delivered. Hold reminders until resolved.,2026-09-10,,
2026-08-10,C003,,Meeting,CFO cites a cash crunch. Will clear both FY 25-26 invoices by 30 Sep.,2026-09-15,2026-09-30,234200.00
2026-08-20,C004,BWA/26-27/0007,Call,"Receipt of 14 Aug is Rs 3,000 short. Customer says bank charges; asked them to pay the difference.",2026-09-05,,
2026-08-25,C006,BWA/26-27/0020,Call,Reminder given. They will pay after their harvest sale proceeds arrive.,2026-09-01,,
2026-09-02,C002,BWA/26-27/0009,Email,Accounts confirmed payment of this invoice by 10 Sep.,,2026-09-10,94400.00
```

---

## Part 4: Technical build guide

### 4.1 The stack (fixed)

| Layer | Use | Why |
|---|---|---|
| Web framework | **Next.js** (latest, App Router) with **TypeScript** | Screens and server-side code in one project. TypeScript catches mistakes before they reach the screen. |
| Styling | **Tailwind CSS** | Clean layouts without writing separate CSS files. |
| Data | **The shared Supabase database** (Part 3), through `@supabase/supabase-js` | Already loaded with the sample data, and each candidate's workspace is kept separate. |
| Hosting | **Vercel** | Deploys automatically each time you push to GitHub. |
| Tests | **Vitest** | A fast test runner for TypeScript. |
| Validation | **zod** | Checks form input on the server before anything is saved. |

Everything above is free. Do not add another database, an ORM or a state library unless you can explain why you needed it. **No login is needed:** the data is fictional, and your workspace id keeps your copy private.

### 4.2 Accounts and tools

Create free accounts on **GitHub** and **Vercel** (sign in to Vercel with GitHub). You do **not** need a Supabase account.

Install:

- **Node.js**, the current LTS release, from nodejs.org. Check it with `node -v`.
- **Git**. Check it with `git --version`. On first use, set your identity so your commits are credited to you:
  ```bash
  git config --global user.name "Your Name"
  git config --global user.email "you@example.com"
  ```
- **VS Code**, and the AI coding assistant of your choice.

### 4.3 How the pieces fit

```
 Browser ──► Next.js on Vercel ──────────────────────────────► Supabase (shared)
             • pages (server components) load the data          • six tables, your workspace only
             • lib/ar/ does every financial calculation         • rejects writes that would corrupt data
             • server actions validate, then save               • calculates nothing
```

**The one architectural rule: every financial calculation lives in one TypeScript module, `lib/ar/`, as plain functions that work in whole paise.** Screens never calculate anything. They call `lib/ar` and display what it returns. The reasons:

- **One source of truth.** The dashboard, customer page, invoice list and statement all call the same functions, so their figures cannot disagree.
- **Testable.** Plain functions run in Vitest in milliseconds without a network, so you can check every day of the year, not just a few (section 4.14).
- **Exact.** Whole paise are integers, and JavaScript adds integers exactly. It does not add rupee decimals exactly: `0.1 + 0.2 === 0.30000000000000004`.

If you find yourself adding up amounts inside a component, stop and move that calculation into `lib/ar`.

**Talk to Supabase only from the server** (server components, server actions and route handlers), never from the browser. Your workspace id then never reaches the browser, and every database call goes through one client (section 4.5).

### 4.4 Setting up the project, step by step

**1. Clone this repository and open it in VS Code.**

**2. Move this brief out of the way.** `create-next-app` refuses to run in a folder that contains a `README.md`, but it accepts a `docs` folder:
```bash
mkdir docs
git mv README.md docs/BRIEF.md
git commit -m "Move brief to docs/BRIEF.md"
```

**3. Create the Next.js app in the current folder** (note the `.` at the end of the first line):
```bash
npx create-next-app@latest . --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm
```
Accept the default answer to any further questions. Then check that it runs:
```bash
npm run dev          # then open http://localhost:3000
```

**4. Install the libraries:**
```bash
npm install @supabase/supabase-js zod server-only
npm install -D vitest
```
Add `"test": "vitest run"` to the `scripts` section of `package.json`.

**5. Create your workspace** with the `curl` command in section 3.2, and copy the id it returns.

**6. Create `.env.local`** in the project root:
```dotenv
SUPABASE_URL=https://jxllwhrinqlzvydzrscs.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4bGx3aHJpbnFsenZ5ZHpyc2NzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3NDU2ODQsImV4cCI6MjEwNTMyMTY4NH0.a6878sV1NRsNWpT32z9pty0lB4SQB-ofQI2yxogSwTg
AR_WORKSPACE_ID=your-workspace-id
```
None of these names start with `NEXT_PUBLIC_`, so Next.js keeps them on the server. Run `git status` and confirm `.env.local` is **not** listed. The `.gitignore` that `create-next-app` generates already excludes it.

**7. Connect.** Create `lib/db.ts` (section 4.5), then temporarily make `app/page.tsx` list the customers. When 8 customers appear at `http://localhost:3000`, the connection works.

**8. Commit and push.** Then deploy (section 4.16). Deploy early and keep deploying: a broken deployment is far easier to fix on day one than on the last day.

### 4.5 Connecting and loading the data

**The client** (`lib/db.ts`). This is the only place that talks to Supabase:

```ts
import 'server-only';
import { createClient } from '@supabase/supabase-js';

export const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
  auth: { persistSession: false },
  global: { headers: { 'x-workspace': process.env.AR_WORKSPACE_ID! } },
});
```

`server-only` makes the build fail if a browser component ever imports this file.

**Types** (`lib/ar/types.ts`). Inside your app, use camelCase names, and store every amount as whole paise:

```ts
export type Paise = number; // whole paise: ₹88,500.00 is 8850000

export interface Invoice {
  id: number; invoiceNo: string; customerId: number;
  invoiceDate: string; dueDate: string; total: Paise;
  isCancelled: boolean; isDisputed: boolean;
}
export interface Allocation { id: number; receiptId: number; invoiceId: number; allocationDate: string; amount: Paise }
export interface CreditNote { id: number; invoiceId: number; creditNoteDate: string; total: Paise }

export interface ArData {
  invoices: Invoice[];
  allocations: Allocation[];
  creditNotes: CreditNote[];
  // customers, receipts, notes: define these the same way
}
```

**The loader** (`lib/ar/load.ts`). The data set is small (under a hundred rows, plus whatever you add), so **load all six tables on every request and calculate in memory**. Do not try to calculate inside database queries. The loader converts each amount to paise once, as it arrives:

```ts
import 'server-only';
import { db } from '@/lib/db';
import type { ArData } from './types';

const paise = (rupees: number) => Math.round(rupees * 100);

export async function loadArData(): Promise<ArData> {
  const [inv, alloc, cn] = await Promise.all([
    db.from('invoices').select('*'),
    db.from('allocations').select('*'),
    db.from('credit_notes').select('*'),
    // …and customers, receipts, notes
  ]);
  for (const r of [inv, alloc, cn]) if (r.error) throw new Error(r.error.message);

  return {
    invoices: inv.data!.map((r) => ({
      id: r.id, invoiceNo: r.invoice_no, customerId: r.customer_id,
      invoiceDate: r.invoice_date, dueDate: r.due_date, total: paise(r.total),
      isCancelled: r.is_cancelled, isDisputed: r.is_disputed,
    })),
    allocations: alloc.data!.map((r) => ({
      id: r.id, receiptId: r.receipt_id, invoiceId: r.invoice_id,
      allocationDate: r.allocation_date, amount: paise(r.amount),
    })),
    creditNotes: cn.data!.map((r) => ({
      id: r.id, invoiceId: r.invoice_id, creditNoteDate: r.credit_note_date, total: paise(r.total),
    })),
  };
}
```

Complete the loader and types for `customers`, `receipts` and `notes` in the same way.

### 4.6 What you cannot change

The database schema is fixed. There are no migrations in this project, no SQL to write, and no tables, database functions or login to create. If your AI assistant suggests any of these, it has misread the brief.

When the database rejects a write (section 3.4), `supabase-js` returns an `error` whose `message` says why, for example *"Invoice BWA/26-27/0007 has only 3000.00 outstanding."* Show that message to the user rather than a generic failure. A few messages come from constraints, for example `violates check constraint "total_equals_taxable_plus_gst"`. Translate those into plain language.

### 4.7 The calculation module (`lib/ar/`)

These functions implement R2 to R17. Each takes the loaded `ArData`, and where relevant the as-at date as a `'YYYY-MM-DD'` string, and returns plain objects that the screens display.

| Function | Returns |
|---|---|
| `invoicePositions(data, asOf)` | One entry per live invoice: `received`, `credited`, `outstanding`, `daysPastDue`, `status`, `isPartPaid`, `bucket` (R11, R12) |
| `receiptPositions(data, asOf)` | One entry per receipt dated on or before `asOf`: `settlement`, `allocated`, `unapplied` |
| `customerPositions(data, asOf)` | One entry per customer: the six buckets, `outstanding`, `unapplied`, `netBalance`, `overdue`, `overLimit` (R13) |
| `balanceByDocuments(data, customerId, asOf)` | The R14 formula |
| `balanceCheck(data, asOf)` | Only the customers whose `netBalance` differs from `balanceByDocuments`. **It must always return an empty list.** |
| `statement(data, customerId, from, to)` | Opening balance, lines with a running balance, and closing balance (R15) |
| `promiseStatuses(data, asOf)` | Each promise to pay with its status (R16) |
| `followUpsDue(data, asOf)` | Open follow-ups dated on or before `asOf` (R16) |
| `dso(data, asOf)` | A number of days, or `null` when there are no sales in the window (R17) |
| `dueDate(invoiceDate, creditDays)` | `'YYYY-MM-DD'` (R2) |
| `gstSplit(state, taxable, ratePct)` | `{ cgst, sgst, igst }` in paise (R3) |
| `fyLabel(date)`, `nextNumber(series, data, date)` | Document numbers (R4) |

Write the rest following the pattern of `invoicePositions`, which is given here in full (`lib/ar/positions.ts`). `customerPositions` builds on it by adding up its entries per customer:

```ts
import type { ArData, Invoice, Paise } from './types';

export type Bucket = 'Not due' | '1-30' | '31-60' | '61-90' | '91-180' | 'Over 180';

export interface InvoicePosition {
  invoice: Invoice;
  received: Paise;
  credited: Paise;
  outstanding: Paise;
  daysPastDue: number;
  status: 'Paid' | 'Due' | 'Overdue';
  isPartPaid: boolean;
  bucket: Bucket | null;
}

/** Whole days from one 'YYYY-MM-DD' date to another. Never uses local time. */
export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  return (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000;
}

export function bucketFor(daysPastDue: number): Bucket {
  if (daysPastDue <= 0) return 'Not due';
  if (daysPastDue <= 30) return '1-30';
  if (daysPastDue <= 60) return '31-60';
  if (daysPastDue <= 90) return '61-90';
  if (daysPastDue <= 180) return '91-180';
  return 'Over 180';
}

/** R11 + R12: the position of every live invoice at the end of asOf ('YYYY-MM-DD'). */
export function invoicePositions(data: ArData, asOf: string): InvoicePosition[] {
  const received = new Map<number, Paise>();
  for (const a of data.allocations) {
    if (a.allocationDate <= asOf) received.set(a.invoiceId, (received.get(a.invoiceId) ?? 0) + a.amount);
  }
  const credited = new Map<number, Paise>();
  for (const c of data.creditNotes) {
    if (c.creditNoteDate <= asOf) credited.set(c.invoiceId, (credited.get(c.invoiceId) ?? 0) + c.total);
  }
  return data.invoices
    .filter((i) => !i.isCancelled && i.invoiceDate <= asOf)
    .map((i) => {
      const rec = received.get(i.id) ?? 0;
      const cred = credited.get(i.id) ?? 0;
      const outstanding = i.total - rec - cred;
      const daysPastDue = daysBetween(i.dueDate, asOf);
      return {
        invoice: i,
        received: rec,
        credited: cred,
        outstanding,
        daysPastDue,
        status: outstanding === 0 ? 'Paid' : daysPastDue >= 1 ? 'Overdue' : 'Due',
        isPartPaid: outstanding > 0 && rec + cred > 0,
        bucket: outstanding === 0 ? null : bucketFor(daysPastDue),
      };
    });
}
```

A few points about the pattern:

- `'YYYY-MM-DD'` strings compare correctly as plain text, so `a.allocationDate <= asOf` **is** the as-at rule (R10). Every date filter in the module works this way.
- `daysBetween` uses `Date.UTC`, so the day count never depends on the time zone of the machine it runs on.
- Every amount is whole paise, so the additions are exact.
- For `gstSplit`, `Math.round(taxablePaise * ratePct / 200)` gives each of CGST and SGST in paise, with halves rounded up.

### 4.8 Saving data (server actions)

Every form submits to a server action that follows the same four steps:

1. **Validate** the input with zod.
2. **Check the business rules** with `lib/ar`, before touching the database. For example, confirm an allocation is no more than the invoice's outstanding amount, and tell the user how much is left.
3. **Write** with `db.from('…').insert(…)` or `.update(…)`. Send amounts in rupees (`paise / 100`). If an `error` comes back, return its message to the form (section 4.6).
4. **Refresh** the affected pages with `revalidatePath`.

| Action | What it writes |
|---|---|
| Create invoice | Work out `invoice_no` (`nextNumber`), `due_date`, the GST split and `total`, then insert into `invoices`. Warn about the credit limit (R9) before saving. |
| Record a payment | Insert the receipt with `.select().single()` to get its `id` back, then insert **all** its allocations in one array insert. If the allocation insert fails, delete the receipt you just created and show the error. |
| Allocate unapplied credit | Insert into `allocations`. |
| Raise a credit note | Work out its number and GST (from the invoice's rate and split), then insert. |
| Cancel an invoice / set disputed / mark a follow-up done | Update the one field. |
| Add a note | Insert into `notes`. |
| Remove an allocation / delete a receipt | Delete. The database refuses to delete a receipt that still has allocations. |

Two things to know about the API:

- **It has no transactions across requests.** That is why recording a payment deletes the receipt again if its allocations fail.
- **Document numbers can collide** if two browser tabs save at the same moment. The second insert fails with a duplicate-key error. Work out the number again and retry once.

### 4.9 Keeping your workspace private

- The anon key is public by design. **Your workspace id is the key to your data:** keep it in `.env.local` and in Vercel's environment settings, never in your code and never in a variable starting with `NEXT_PUBLIC_`.
- If your workspace id leaks, create a new workspace (section 3.2) and update `AR_WORKSPACE_ID`.

### 4.10 The Next.js app

**Suggested structure:**

```
app/
  layout.tsx                  ← header: navigation + as-at date picker
  page.tsx                    ← Overdue at a glance
  customers/…                 ← list, new, [id], [id]/edit
  invoices/…                  ← list, new, [id]
  receipts/new/page.tsx
  statement/page.tsx          ← also the print layout
  statement/export/route.ts   ← CSV download
lib/
  db.ts                       ← the Supabase client (server only)
  ar/                         ← types, loader and every calculation
  actions/…                   ← server actions (one file per area)
  asof.ts                     ← reads ?asof=, defaults to today in Asia/Kolkata
  format.ts                   ← money, dates, Dr/Cr
  seller.ts                   ← Brightwater's name and address
scripts/snapshot.ts           ← saves the sample data as a test fixture (section 4.14)
tests/…                       ← including tests/fixtures/sample.json
docs/BRIEF.md
ai-logs/
```

**The as-at date.** Every page reads `?asof=YYYY-MM-DD` from the URL. `lib/asof.ts` validates it and, when it is missing, returns **today in India**:

```ts
new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()) // → "2026-09-18"
```

Vercel's servers run in UTC. If you use the server's own date, then between midnight and 05:30 IST "today" is still yesterday. The date picker updates the URL, and every navigation link keeps the `asof` parameter.

**Reading data.** Pages are server components:

```ts
const data = await loadArData();
const rows = customerPositions(data, asof);
```

Then render `rows`.

**Writing data** follows section 4.8.

**Screens** are listed in Part 2. Keep them plain and quick to read: tables with right-aligned amounts, red for overdue rows, and amber for the disputed label.

### 4.11 Money, dates and formatting

- **Money is whole paise inside the app.** Convert once in the loader (`Math.round(x * 100)`), and back only to display an amount or save it (`paise / 100`).
- **Formatting money:** `new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100)` gives `₹1,23,456.00`. For balances, format the absolute value and add `Dr` or `Cr`.
- **Dates** arrive as strings like `"2026-08-31"`. Keep them as strings. **Do not** turn them into `new Date("2026-08-31")`, which is midnight UTC and can display as the previous day. Count days with `daysBetween`, add days with `Date.UTC` in the same way, and format by splitting the string, for example into `31-Aug-2026`.
- Put these helpers in `lib/format.ts` and test them (section 4.14).

### 4.12 Printing and CSV export

- **Print:** add a print stylesheet (Tailwind's `print:` variants) that hides the navigation and buttons, and sets an A4 page with `@page { size: A4; margin: 15mm; }`. A Print button calls `window.print()`. The printed statement shows Brightwater's name and city, the customer, the period, the table and the ageing footer.
- **CSV:** use a route handler (`route.ts`) that returns `text/csv` with a `Content-Disposition: attachment; filename="Statement_C002_2026-04-01_to_2026-08-31.csv"` header.
  - Start the file with a UTF-8 BOM (`﻿`) so Excel reads it correctly.
  - Write amounts as plain numbers (`70800.00`), without ₹ or commas.
  - Put quotes around any field that contains a comma.

### 4.13 Keeping the figures fresh

Next.js may render a page once when you build it and serve that copy afterwards. Pages that read the `?asof=` parameter are rendered fresh on every request, so make sure every page reads it. After each save, call `revalidatePath` for the pages the change affects.

### 4.14 Testing

1. **A fixture.** Reset your workspace (section 3.2), then save the six tables to `tests/fixtures/sample.json` with a small script, `scripts/snapshot.ts`, that fetches them and writes the file. Run it with `node --env-file=.env.local scripts/snapshot.ts`; current Node.js runs TypeScript files directly. Your tests read this file, so they run offline, and they don't change when you add test records to your workspace.
2. **Unit tests for `lib/ar`** (Vitest, in `tests/`):
   - each spot check in Part 1,
   - `balanceCheck` returns an empty list **for every day** from `2026-01-01` to `2026-10-31` (a simple loop),
   - bucket boundaries, `gstSplit`, `dueDate` and `nextNumber`,
   - every statement's closing balance equals `balanceByDocuments` for its To date.
3. **Helper tests:** money and date formatting, Dr/Cr, CSV quoting, `asof` parsing and the default to today.
4. **A manual test script** (`docs/TESTING.md`): the clicks you make before every release. For example: record a part-payment with TDS, then check the invoice, the customer, the dashboard and the statement all agree.

### 4.15 Git

- **Commit every time something works**, with a message that says what changed: `Add invoice list with status filter`, not `update` or `fixes`.
- **Push after every commit.** Vercel deploys each push.
- Run `git status` before every commit. `.env.local`, `node_modules/` and `.next/` must never appear in the list of files to commit.
- We read your commit history. Steady progress shows in it. So does a single commit at the end.

### 4.16 Deploying to Vercel

1. In Vercel, choose **Add New → Project**, import your GitHub repository, and keep the detected Next.js settings.
2. Under **Environment Variables**, add `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `AR_WORKSPACE_ID`, with the same values as your `.env.local`.
3. Deploy, open the URL, and go through the spot checks.
4. If you add or change an environment variable later, redeploy. Vercel applies environment variables only to new deployments.

### 4.17 Working with an AI coding assistant

- **Brief it properly.** Point it at `docs/BRIEF.md`, tell it which section you are working on, and ask it to describe its plan before it writes any code.
- **Work on one screen or one function at a time**, and commit between each.
- **Check its work against the numbers.** After each calculation function, run the spot checks. AI assistants often write code that looks right but gets a boundary wrong, for example writing `<` where the rule needs `<=`.
- **Keep it inside the brief.** The schema is fixed, so if it proposes migrations, SQL functions, new tables or a login, stop it (section 4.6).
- **Keep your conversations.** Export or copy them into `ai-logs/`. We read them.

### 4.18 Troubleshooting

| Symptom | Likely cause |
|---|---|
| `create-next-app` says the folder contains conflicting files | A `README.md` (or another file) is still in the root. Complete step 2 of section 4.4 first. |
| *"Missing x-workspace header"* | `AR_WORKSPACE_ID` is empty or missing. Check `.env.local` and restart `npm run dev`. On Vercel, add the variable, then redeploy. |
| *"Unknown workspace …"* | The workspace id has a typo. Copy it again from the `create_workspace` response. |
| *"permission denied for table invoices"*, with a hint to GRANT privileges | Invoices, customers and credit notes cannot be deleted, by design. Cancel or deactivate instead. Ignore the hint: you cannot grant privileges. |
| *"An issued invoice cannot be edited"* | Only `description` and `is_disputed` can change. Raise a credit note, or cancel the invoice and raise a new one. |
| `violates check constraint "total_equals_taxable_plus_gst"` | The total you sent is not taxable value + CGST + SGST + IGST. Check the paise conversion. |
| A customer's figures are off by exactly the TDS | Only `bank_amount` is being used. The settlement value is bank + TDS (R5). |
| BWA/26-27/0017 shows as part-paid as at 31 Aug | The receipt date is being used instead of the allocation date (R10). |
| A date shows one day early | A date string has been turned into a JavaScript `Date` (section 4.11). |
| Your figures no longer match the spot checks, though they did before | You have added records while testing. Reset your workspace (section 3.2). |
| A page never shows new data | Next.js rendered it once at build time. See section 4.13. |
| It works locally but the Vercel build fails | A TypeScript or ESLint error that only the production build reports (run `npm run build` locally to see it), or a missing environment variable on Vercel. |
| Every request fails or times out | The shared database may be paused. Reply to the email that sent you this assignment, and we will restore it. |

---

## Part 5: Build order

Commit and push at the end of every step.

1. **Skeleton:** move the brief, create the Next.js app, and **deploy it to Vercel** while it is still a blank page.
2. **Connection:** create your workspace, add `lib/db.ts` and the environment variables, and list the 8 customers on the home page, both locally and on Vercel.
3. **Data layer:** types, the loader, and the test fixture.
4. **Calculations:** the functions from section 4.7, with tests. Every spot check passes, and `balanceCheck` is empty for every day.
5. **Layout and as-at date:** header, navigation, the date picker, and formatting helpers with their tests.
6. **Customer Master.**
7. **Invoices:** list, invoice page, create, credit note, cancel, disputed flag.
8. **Overdue at a glance.**
9. **Record a payment** and allocate unapplied credit.
10. **Notes, follow-ups and promises.**
11. **Statement:** on screen, print and CSV. Then the CSV exports of the invoice list and ageing report.
12. **Finish:** `docs/TESTING.md`, your `README.md`, and a final pass over the spot checks on the live site after resetting your workspace.

---

## Part 6: Submitting, and how we evaluate

**Your `README.md`** should cover: what you built; how to run it (the three environment variables, then `npm run dev`); how to run the tests and refresh the fixture; the assumptions you made; known gaps; and what you would do next. If something in this brief is ambiguous, make a sensible decision, write it down under **Assumptions**, and carry on.

**To submit**, reply to the email that sent you this assignment with:

- the repository link (public, or private with access given to the GitHub user named in that email),
- the Vercel URL,
- your **workspace id**,
- anything you want us to know.

The deadline is in that email.

**How we evaluate:**

1. **The figures are correct.** First we reset your workspace to the sample data, so any records you created while testing make no difference. Then we set the as-at date to several dates and compare every figure (balances, statuses, ageing buckets, DSO, statements and promises) with our own calculation, to the paisa.
2. **It is complete.** All four areas work from start to finish. Your tool catches problems before the database has to, and explains them clearly.
3. **It is usable.** An AR analyst could sit down and use it without being shown how.
4. **It is well engineered.** We look at your calculation module and its tests, the code structure, your commit history, README and deployment.
5. **You understand it.** In the next round you will walk us through the tool, explain how it is built, and make a change to it live. Build it in a way that you understand.
