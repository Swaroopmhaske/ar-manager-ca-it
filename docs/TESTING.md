# Manual test script

Run this before every release. **Start by resetting the workspace** (docs/BRIEF.md §3.2) so the figures match. Each step says what to click and what you should see. Amounts are from the sample data.

Where a step says *as at D*, set the date picker in the header to D (the URL shows `?asof=D`).

## A. As-at date and navigation

| # | Do | Expect |
|---|---|---|
| A1 | Open the home page with no `?asof=` | The date picker shows today's date in India. |
| A2 | Pick 31-Aug-2026 | URL gains `?asof=2026-08-31`; every menu link (Dashboard, Customers, Invoices, Receipts, **Statement**) keeps it. |
| A3 | Open `/?asof=not-a-date` | Falls back to today; no error. |

## B. Dashboard (as at 31-Aug-2026)

| # | Do | Expect |
|---|---|---|
| B1 | Read the summary cards | Outstanding ₹21,18,100.00 · Unapplied ₹1,00,000.00 · Net receivable ₹20,18,100.00 Dr · Overdue ₹12,86,200.00 (61% of outstanding) · DSO 111 days · 11 overdue invoices. |
| B2 | Ageing table headings | Not due · 1-15 · 16-30 · 31-45 · 46-90 · Over 90. No 1–30 / 31–60 / 61–90 / 91–180 / Over 180 anywhere. |
| B3 | Ageing **Total** row | ₹8,31,900.00 · ₹5,07,400.00 · ₹1,18,000.00 · ₹1,29,800.00 · ₹1,67,000.00 · ₹3,64,000.00; outstanding ₹21,18,100.00. The bands add up to the outstanding total. |
| B4 | Click a customer name in the ageing table | Invoice list filtered to that customer. |
| B5 | Overdue invoices panel | Red rows, longest late first (BWA/25-26/0141 at the top); BWA/26-27/0010 shows **Disputed**. |
| B6 | Needs attention | **Over credit limit:** Kundalika Castings (net ₹4,46,600.00 Dr vs ₹4,00,000.00). **Broken promises:** Varandha Freight (₹69,600.00 by 01-Aug-2026). **Follow-ups due:** none. **Unapplied credit:** Sabarmati Retail, ₹1,00,000.00. |
| B7 | Change the date to 15-Sep-2026 | Follow-ups due now lists 4 (01-Sep, 05-Sep, 10-Sep, 15-Sep); Sabarmati no longer has unapplied credit (allocated 05-Sep). |
| B8 | Click **Export ageing CSV** | Downloads `Ageing_2026-08-31.csv`; opens cleanly in Excel; new band headings; a Total row; plain amounts like `88500.00`. |

## C. Customers (as at 31-Aug-2026)

| # | Do | Expect |
|---|---|---|
| C1 | Search `rohan`, then `C005`, then `mulshiagro@` | C002, then C005, then C006. |
| C2 | Status filter Inactive | Only C008 Kamshet Hospitality. |
| C3 | Click **Balance** header, then click it again | Sorted lowest → highest, then highest first (C007 ₹7,31,600.00 Dr at the top). The ▲/▼ arrow follows. Try every header. |
| C4 | Limit used column | C005 Sabarmati **36%** (not 76%; balance shows "after ₹1,00,000.00 unapplied"); C003 **112%** with "Over limit". |
| C5 | Add customer with a duplicate code, a bad email, credit days −1, TDS 150 | Each is refused with a clear message; nothing saved. |
| C6 | Add a valid customer; edit its city | Saved; appears in the list. |
| C7 | Deactivate it, then Reactivate | Status toggles; while inactive it is missing from the New invoice customer list. |
| C8 | Open C005 | Net balance ₹88,800.00 Dr; Outstanding ₹1,88,800.00; Unapplied ₹1,00,000.00; receipts table shows RCT/26-27/0011 with ₹1,00,000.00 unapplied. Quick actions: New invoice, Record payment, Statement, Edit, Deactivate. |

## D. Invoices (as at 31-Aug-2026)

| # | Do | Expect |
|---|---|---|
| D1 | Status filter **Cancelled** | Exactly BWA/26-27/0014, status Cancelled, total struck through, amounts "—". |
| D2 | Status All | 0014 is listed; the Total row says cancelled invoices are not added in. |
| D3 | Open BWA/26-27/0014 | Page opens (no 404) with a Cancelled banner; no Credit note button. |
| D4 | Search `0007` | Only BWA/26-27/0007. |
| D5 | Customer = C005 | BWA/26-27/0017 and 0022 only. |
| D6 | Disputed only | BWA/26-27/0010 with the amber Disputed label. |
| D7 | From 01-Jul-2026 to 31-Jul-2026 | 0014–0019 (six invoices). |
| D8 | Click each column header twice | Rows reorder ascending then descending (Total, Outstanding, Days late, Due date, Status…). Filters stay applied. |
| D9 | BWA/26-27/0003 row | Outstanding ₹69,600.00, Overdue + Part-paid, 90 days late. On its page: bucket **46-90**. |
| D10 | BWA/26-27/0021 at 31-Aug / 06-Sep / 15-Sep | Due ₹88,500.00 / Overdue 2 days ₹88,500.00 / Paid. |
| D11 | **Export CSV** with filters on | The file holds the same filtered, sorted rows plus a total line. |

## E. Creating invoices: GST, due date, numbering, credit limit

| # | Do | Expect |
|---|---|---|
| E1 | New invoice, C001, date 05-Oct-2026, taxable 75,000, 18% | Preview: **BWA/26-27/0025**, due **04-Nov-2026 (30 days)**, CGST ₹6,750.00 + SGST ₹6,750.00, total ₹88,500.00. No warning. |
| E2 | Change taxable to **1000.05** | CGST **₹90.00**, SGST **₹90.00**, total ₹1,180.05. |
| E3 | Change customer to C007 (Telangana) | One IGST line: ₹180.01 on ₹1,000.05. |
| E4 | Change customer to C003 (over limit), any amount | Amber warning: limit ₹4,00,000.00, current net balance, this invoice, net balance after. The button reads **Save anyway**. |
| E5 | Click Save anyway | Saved: the warning never blocks. The invoice opens with its number. |
| E6 | C001 with taxable just under the room left | No warning; at exactly the limit there is still no warning (only *above* warns). |
| E7 | Date 01-Apr-2027 | Number becomes BWA/27-28/0001. |
| E8 | Disputed: open the new invoice → Actions → mark disputed, then clear | Label appears / disappears; amounts unchanged. |
| E9 | Cancel the new invoice (no payments on it) | Status Cancelled; number kept; the next new invoice does **not** reuse it. |
| E10 | Try to cancel BWA/26-27/0003 | Refused: it has a payment allocated. |

## F. Recording a payment (TDS, open invoices, suggestion, unapplied)

Use date **01-Oct-2026**.

| # | Do | Expect |
|---|---|---|
| F1 | Receipts → Record payment, customer C001 | Open invoices: BWA/26-27/0024, ₹88,500.00 open (paid ones and other customers' invoices are not shown). |
| F2 | Bank amount 81,000 | TDS pre-fills **₹7,500.00** (10% of the ₹75,000 taxable value); suggestion ₹88,500.00 to 0024; unapplied ₹0.00. |
| F3 | Change TDS to 7,000 | TDS is editable; the suggestion becomes ₹88,000.00 and the "Use expected" button appears. |
| F4 | Customer C002, bank 50,000 | Open: 0003 (₹69,600.00) then 0018 (₹59,000.00), oldest due date first. TDS pre-fills ₹4,629.63; suggestion ₹54,629.63 to 0003 only. |
| F5 | Overwrite: put 20,000 on 0003 and 10,000 on 0018 | Allocated ₹30,000.00; **Remains unapplied credit ₹24,629.63**. |
| F6 | Put more than ₹69,600 on 0003 | The box turns red ("More than is open") and Save is disabled. |
| F7 | Make allocations exceed the settlement | Unapplied goes negative in red; Save is disabled. |
| F8 | Save F5 | Lands on C002's page; the receipt shows ₹24,629.63 unapplied; dashboard **Needs attention** lists it; customer balance and ageing have changed accordingly. |
| F9 | Customer C005 (advance only), bank 10,000 | No open invoices on or before the date; everything stays unapplied credit. |

## G. Allocating credit and corrections

| # | Do | Expect |
|---|---|---|
| G1 | From C002's page, click **Allocate credit** on the F8 receipt | The receipt page shows the existing allocations and a form suggesting the unapplied amount oldest first. |
| G2 | Set an allocation date before the receipt date | The picker will not allow it; the server also refuses with a message. |
| G3 | Allocate the rest | Unapplied becomes ₹0.00; the invoice outstanding drops. |
| G4 | Click **Remove** on one allocation, confirm | It disappears; the invoice outstanding, customer balance, unapplied credit, ageing, dashboard and statement all update. |
| G5 | Receipts list: an allocated receipt | No Delete button (only for receipts with no allocations). |
| G6 | Remove all allocations of that receipt, then **Delete** it | Deleted; it is gone from every screen. |
| G7 | Record a receipt with no allocations, then delete it from the Receipts list | Works. |

## H. Credit notes

| # | Do | Expect |
|---|---|---|
| H1 | BWA/26-27/0007 → Credit note, taxable 2,542.37 | Preview CGST + SGST (the invoice's split), total ₹2,999.99; "Still open on this invoice ₹3,000.00". |
| H2 | Taxable 2,542.39 | Total ₹3,000.03; red message; button disabled. |
| H3 | Save H1 | Number BWA/CN/26-27/002; outstanding on 0007 becomes ₹0.01. |

## I. Statements

| # | Do | Expect |
|---|---|---|
| I1 | Click **Statement** in the menu | A customer picker; From defaults to 01-Apr of the financial year, To to the as-at date. |
| I2 | C002, 01-Apr-2026 to 31-Aug-2026 | Opening **₹70,800.00 Dr**, 7 lines, closing **₹2,23,000.00 Dr**. TDS appears as its own "TDS deducted by you" line. No allocations, notes or cancelled invoices. |
| I3 | Footer | Closing balance by band (Not due ₹59,000.00, 46-90 ₹1,64,000.00) and unapplied credit. |
| I4 | C005, 01-Jul-2026 to 31-Aug-2026 | The footer shows unapplied credit ₹1,00,000.00, with a sentence explaining it. |
| I5 | **Print** | Print preview is A4 with no menu, buttons or forms: seller name and address, customer, period, table, footer. |
| I6 | **Export CSV** | `Statement_C002_2026-04-01_to_2026-08-31.csv`; opens in Excel; opening and closing rows, amounts like `70800.00`, a Dr/Cr column, the ageing footer. |

## J. Client change: Tamhini Foods terms (do this last; it changes data)

| # | Do | Expect |
|---|---|---|
| J1 | Note C001's invoices' due dates, e.g. BWA/26-27/0001 due 05-May-2026 | |
| J2 | Customers → C001 → Edit → Credit days **45** → Save | C001 shows 45 credit days. |
| J3 | Look at C001's existing invoices | **Due dates unchanged** (0001 still 05-May-2026; 0021 still 04-Sep-2026). |
| J4 | New invoice for C001 dated 05-Oct-2026 | Preview due date **19-Nov-2026 (45 days)**. |

## K. Control check and DSO

| # | Do | Expect |
|---|---|---|
| K1 | `npm test` | All tests pass, including the R14 check for every day from 01-Jan to 31-Oct-2026. |
| K2 | Statement closing balance for any customer and date | Equals the customer's net balance on the customer page for that date. |
| K3 | Dashboard at 31-Aug-2026 | DSO 111 days. At a date before the first invoice (e.g. 01-Jan-2025) DSO shows "—". |
