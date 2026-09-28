import type { CaseState } from "@/lib/types/agents";

export const CASE_ID = "CG-001";
export const CASE_ACCOUNT = "XXXX1234";

export const syntheticCase: CaseState = {
  caseId: CASE_ID,
  account: CASE_ACCOUNT,
  status: "open",
  disputedAmount: 60700,
  disputedTransactionCount: 3,
  transactions: [
    {
      id: "TX-CG001-01",
      time: "02:11",
      amount: 35000,
      currency: "INR",
      channel: "ATM",
      account: CASE_ACCOUNT,
      disputed: true,
      classification: "Disputed ATM cash withdrawal",
    },
    {
      id: "TX-CG001-02",
      time: "02:13",
      amount: 18500,
      currency: "INR",
      channel: "ATM",
      account: CASE_ACCOUNT,
      disputed: true,
      classification: "Disputed ATM cash withdrawal",
    },
    {
      id: "TX-CG001-03",
      time: "02:16",
      amount: 7200,
      currency: "INR",
      channel: "ATM",
      account: CASE_ACCOUNT,
      disputed: true,
      classification: "Disputed ATM cash withdrawal",
    },
  ],
  evidence: [
    {
      id: "E01",
      title: "Bank Statement",
      kind: "bank_statement",
      description:
        "Synthetic statement lists ATM withdrawals at 02:11 for INR 35,000, 02:13 for INR 18,500, and 02:16 for INR 7,200.",
      transactionIds: ["TX-CG001-01", "TX-CG001-02", "TX-CG001-03"],
      verified: false,
    },
    {
      id: "E02",
      title: "SMS Screenshot",
      kind: "customer_supplied_screenshot",
      description: "Synthetic screenshot record associated with the disputed ATM activity.",
      transactionIds: ["TX-CG001-01", "TX-CG001-02", "TX-CG001-03"],
      verified: false,
    },
    {
      id: "E03",
      title: "Complaint Acknowledgement",
      kind: "complaint_acknowledgement",
      description: "Synthetic acknowledgement of the customer's dispute report.",
      transactionIds: [],
      verified: false,
    },
  ],
  findings: [],
  tasks: [],
  actions: [],
  verifications: [],
  events: [],
  agentResults: [],
  revision: 0,
  updatedAt: new Date(0).toISOString(),
};
