export const mockCase = {
  caseId: "CG-001",
  risk: "HIGH",
  disputedAmount: "₹60,700",
  transactions: 3,
  evidence: 3,
  status: "INVESTIGATING",

  agents: [
    { name: "Supervisor", status: "working" },
    { name: "Triage", status: "complete" },
    { name: "Forensics", status: "complete" },
    { name: "Evidence", status: "complete" },
    { name: "Investigation", status: "working" },
    { name: "Risk", status: "pending" },
    { name: "Action", status: "pending" },
    { name: "Verification", status: "pending" },
  ],

  timeline: [
    {
      time: "14:02:11",
      agent: "Supervisor",
      message: "Planning investigation",
    },
    {
      time: "14:02:12",
      agent: "Triage",
      message: "Unauthorized transaction",
    },
    {
      time: "14:02:13",
      agent: "Forensics",
      message: "Transaction timeline reconstructed",
    },
    {
      time: "14:02:14",
      agent: "Evidence",
      message: "Statement located",
    },
    {
      time: "14:02:15",
      agent: "Risk",
      message: "HIGH risk indicators identified",
    },
  ],

  findings: [
    "₹60,700 disputed",
    "3 suspicious transactions",
    "ATM withdrawal pattern",
    "Transaction sequence reconstructed",
  ],

  verification: [
    "Transaction amount",
    "Transaction timestamps",
    "Evidence linkage",
  ],
};