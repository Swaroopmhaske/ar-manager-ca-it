export type Paise = number;

export interface Customer {
  id: number;
  code: string;
  name: string;
  city: string | null;
  state: string | null;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  gstin: string | null;
  creditDays: number;
  creditLimit: Paise;
  tdsRatePct: number;
  isActive: boolean;
}

export interface Invoice {
  id: number;
  invoiceNo: string;
  customerId: number;
  invoiceDate: string;
  dueDate: string;
  description: string;
  taxableValue: Paise;
  gstRatePct: number;
  cgst: Paise;
  sgst: Paise;
  igst: Paise;
  total: Paise;
  isCancelled: boolean;
  isDisputed: boolean;
}

export interface CreditNote {
  id: number;
  creditNoteNo: string;
  invoiceId: number;
  creditNoteDate: string;
  taxableValue: Paise;
  cgst: Paise;
  sgst: Paise;
  igst: Paise;
  total: Paise;
  reason: string;
}

export interface Receipt {
  id: number;
  receiptNo: string;
  customerId: number;
  receiptDate: string;
  bankAmount: Paise;
  tdsAmount: Paise;
  mode: "NEFT" | "RTGS" | "IMPS" | "UPI" | "Cheque";
  reference: string | null;
}

export interface Allocation {
  id: number;
  receiptId: number;
  invoiceId: number;
  allocationDate: string;
  amount: Paise;
}

export interface Note {
  id: number;
  customerId: number;
  invoiceId: number | null;
  noteDate: string;
  noteType: "Call" | "Email" | "Meeting" | "Note";
  body: string;
  followUpDate: string | null;
  followUpDone: boolean;
  promiseDate: string | null;
  promiseAmount: Paise | null;
}

export interface ArData {
  customers: Customer[];
  invoices: Invoice[];
  creditNotes: CreditNote[];
  receipts: Receipt[];
  allocations: Allocation[];
  notes: Note[];
}