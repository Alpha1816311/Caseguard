type BackendCaseResponse = {
  case: {
    caseId: string;
    status: string;
    disputedAmount: number;
    disputedTransactionCount: number;

    transactions: Array<{
      id?: string;
      transactionId?: string;
      time?: string;
      timestamp?: string;
      amount: number;
      channel?: string;
    }>;

    evidence: Array<unknown>;

    findings: Array<{
      title?: string;
      description?: string;
      severity?: string;
    }>;

    verifications: Array<unknown>;

    events: Array<{
      id?: string;
      eventType?: string;
      description?: string;
      createdAt?: string;
    }>;

    agentResults: Array<{
      agent: string;
      status: string;
      summary: string;

      findings?: Array<{
        title: string;
        description?: string;
        severity?: string;
      }>;

      data?: {
        riskLevel?: string;

        timeline?: Array<{
          time?: string;
          timestamp?: string;
          amount: number;
          channel?: string;
        }>;

        verifications?: Array<{
          check: string;
          status: string;
        }>;
      };
    }>;
  };
};

export function adaptCaseResponse(data: BackendCaseResponse) {
  const caseData = data.case;

  // Use the most recent completed result for each agent.
  const latestAgentResult = (agentName: string) =>
    [...caseData.agentResults]
      .reverse()
      .find(
        (result) =>
          result.agent === agentName && result.status === "completed",
      );

  const riskAgent = latestAgentResult("risk");
  const verificationAgent = latestAgentResult("verification");
  const forensicsAgent = latestAgentResult("transaction_forensics");

  // Backend can contain historical findings from previous replanning runs.
  // Deduplicate them for the dashboard.
  const findingTitles = [
    ...caseData.findings.map((finding) => finding.title),
    ...caseData.agentResults.flatMap(
      (result) => result.findings?.map((finding) => finding.title) ?? [],
    ),
  ].filter((title): title is string => Boolean(title));

  const findings = [...new Set(findingTitles)];

  // Prefer the forensics agent timeline.
  // Fall back to the case transactions if needed.
  const forensicTimeline = forensicsAgent?.data?.timeline ?? [];

  const timeline =
    forensicTimeline.length > 0
      ? forensicTimeline.map((item, index) => ({
          time:
            item.time ??
            item.timestamp ??
            `14:02:${11 + index}`,
          agent: "Forensics",
          message: `${item.channel ?? "ATM"} transaction ${
            index + 1
          }: ₹${item.amount.toLocaleString("en-IN")}`,
        }))
      : caseData.transactions.map((transaction, index) => ({
          time:
            transaction.time ??
            transaction.timestamp ??
            `14:02:${11 + index}`,
          agent: "Forensics",
          message: `${transaction.channel ?? "ATM"} transaction ${
            index + 1
          }: ₹${transaction.amount.toLocaleString("en-IN")}`,
        }));

  const verification =
    verificationAgent?.data?.verifications
      ?.filter((item) => item.status === "verified")
      .map((item) => item.check) ?? [];

  // These are the agents actually returned by the current backend.
  const agentDefinitions = [
    { key: "supervisor", name: "Supervisor" },
    { key: "replanner", name: "Replanner" },
    { key: "transaction_forensics", name: "Forensics" },
    { key: "evidence", name: "Evidence" },
    { key: "action_planner", name: "Action Planner" },
    { key: "verification", name: "Verification" },
  ];

  const agents = agentDefinitions.map(({ key, name }) => {
    const result = latestAgentResult(key);

    return {
      name,
      status:
        result?.status === "completed"
          ? "complete"
          : "pending",
    };
  });

  return {
    caseId: caseData.caseId,

    risk: (
      riskAgent?.data?.riskLevel ?? "high"
    ).toUpperCase(),

    disputedAmount: `₹${caseData.disputedAmount.toLocaleString(
      "en-IN",
    )}`,

    transactions: caseData.disputedTransactionCount,

    evidence: caseData.evidence.length,

    status: caseData.status.toUpperCase(),

    agents,

    timeline,

    findings,

    verification,
  };
}