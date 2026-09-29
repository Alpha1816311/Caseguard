import { generateAgentNarrative } from "@/lib/ai/groq";
import type {
  AgentName,
  AgentResult,
  AgentTask,
  CaseEvent,
  CaseState,
  InvestigationFinding,
  RecommendedAction,
  VerificationResult,
} from "@/lib/types/agents";

const timestamp = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

function finding(
  agent: AgentName,
  title: string,
  description: string,
  severity: InvestigationFinding["severity"],
  confidence: number,
  evidenceIds: string[] = [],
): InvestigationFinding {
  return {
    id: id("finding"),
    title,
    description,
    severity,
    confidence,
    sourceAgent: agent,
    evidenceIds,
    createdAt: timestamp(),
  };
}

function task(
  agent: AgentName,
  title: string,
  description: string,
): AgentTask {
  return {
    id: id("task"),
    agent,
    title,
    description,
    status: "pending",
    createdAt: timestamp(),
  };
}

function action(
  title: string,
  description: string,
  category: RecommendedAction["category"],
  approval: RecommendedAction["approval"],
  evidenceIds: string[] = [],
): RecommendedAction {
  return {
    id: id("action"),
    title,
    description,
    category,
    approval,
    status: approval === "required" ? "pending_approval" : "prepared",
    evidenceIds,
    createdAt: timestamp(),
  };
}

function verification(
  check: string,
  status: VerificationResult["status"],
  expected: string,
  actual: string,
  details: string,
  evidenceIds: string[] = [],
): VerificationResult {
  return {
    id: id("verification"),
    check,
    status,
    expected,
    actual,
    details,
    evidenceIds,
    createdAt: timestamp(),
  };
}

async function result(
  state: CaseState,
  input: {
    agent: AgentName;
    task: string;
    summary: string;
    findings?: InvestigationFinding[];
    evidenceIds?: string[];
    tasks?: AgentTask[];
    actions?: RecommendedAction[];
    confidence: number;
    nextAgents: AgentName[];
    useGroq?: boolean;
    data?: Record<string, unknown>;
  },
): Promise<AgentResult> {
  const generated = input.useGroq
    ? await generateAgentNarrative({
    agent: input.agent,
    task: input.task,
    caseContext: {
      caseId: state.caseId,
      account: state.account,
      disputedAmount: state.disputedAmount,
      transactions: state.transactions,
      evidence: state.evidence.map(({ id: evidenceId, title, kind }) => ({
        id: evidenceId,
        title,
        kind,
      })),
      completedAgents: state.agentResults.map((run) => run.agent),
      recentEvents: state.events.map((event) => ({
        eventType: event.eventType,
        description: event.description,
      })),
    },
    fallbackNextAgents: input.nextAgents,
      })
    : { narrative: null, warning: null };

  return {
    agent: input.agent,
    status: "completed",
    summary: generated.narrative?.summary ?? input.summary,
    findings: input.findings ?? [],
    evidenceIds: input.evidenceIds ?? [],
    tasks: input.tasks ?? [],
    actions: input.actions ?? [],
    confidence: generated.narrative?.confidence ?? input.confidence,
    nextAgents: generated.narrative?.nextAgents.length
      ? generated.narrative.nextAgents
      : input.nextAgents,
    data: {
      ...input.data,
      aiProvider: generated.narrative ? "groq" : "deterministic",
      ...(generated.warning ? { aiWarning: generated.warning } : {}),
    },
  };
}

export async function runTriageAgent(
  state: CaseState,
  assignedTask: AgentTask,
): Promise<AgentResult> {
  const rapidSequence = state.transactions.length >= 2;
  return result(state, {
    agent: "triage",
    task: assignedTask.description,
    summary: `Classified ${state.disputedTransactionCount} disputed ATM withdrawals totaling INR ${state.disputedAmount.toLocaleString("en-IN")} for priority investigation.`,
    findings: [
      finding(
        "triage",
        "Rapid disputed ATM activity",
        `${state.disputedTransactionCount} disputed withdrawals are reported on account ${state.account}; the sequence and aggregate loss warrant urgent human review.`,
        rapidSequence ? "high" : "medium",
        0.94,
      ),
    ],
    tasks: [
      task(
        "transaction_forensics",
        "Reconstruct disputed transaction timeline",
        "Classify each disputed transaction and reconstruct the event timeline.",
      ),
      task("evidence", "Map available case evidence", "Search and link existing case evidence."),
    ],
    confidence: 0.94,
    nextAgents: ["transaction_forensics", "evidence"],
    useGroq: true,
    data: { classification: "disputed_cash_withdrawals", priority: "high" },
  });
}

export async function runForensicsAgent(
  state: CaseState,
  assignedTask: AgentTask,
): Promise<AgentResult> {
  const statement = state.evidence.find((item) => item.id === "E01");
  const crossChecking = /cross-check|bank statement/i.test(assignedTask.description);
  const checks = state.transactions.map((transaction) => ({
    transactionId: transaction.id,
    time: transaction.time,
    amount: transaction.amount,
    classification: transaction.classification ?? "Disputed ATM cash withdrawal",
    statementMatch:
      Boolean(statement) &&
      Boolean(statement?.description.includes(transaction.time)) &&
      Boolean(
        statement?.description.includes(
          transaction.amount.toLocaleString("en-IN"),
        ),
      ),
  }));
  const matchCount = checks.filter((item) => item.statementMatch).length;
  const total = state.transactions.reduce(
    (sum, transaction) => sum + transaction.amount,
    0,
  );
  const crossCheckPassed = Boolean(statement) && matchCount === state.transactions.length;
  const findings = [
    finding(
      "transaction_forensics",
      crossChecking ? "Bank statement transaction cross-check" : "Transaction timeline reconstructed",
      crossChecking
        ? `Matched ${matchCount} of ${state.transactions.length} disputed transactions to E01; reconstructed total is INR ${total.toLocaleString("en-IN")}.`
        : `Reconstructed ${state.transactions.length} disputed ATM withdrawals between ${state.transactions[0]?.time ?? "unknown"} and ${state.transactions.at(-1)?.time ?? "unknown"}; total INR ${total.toLocaleString("en-IN")}.`,
      crossChecking && !crossCheckPassed ? "high" : "medium",
      crossChecking ? (crossCheckPassed ? 0.99 : 0.5) : 0.96,
      statement ? [statement.id] : [],
    ),
  ];

  return result(state, {
    agent: "transaction_forensics",
    task: assignedTask.description,
    summary: crossChecking
      ? `Cross-checked ${matchCount} transaction lines against E01 and calculated INR ${total.toLocaleString("en-IN")}.`
      : `Reconstructed a ${state.transactions.length}-transaction timeline totaling INR ${total.toLocaleString("en-IN")}.`,
    findings,
    evidenceIds: statement ? [statement.id] : [],
    confidence: crossChecking && !crossCheckPassed ? 0.5 : 0.96,
    nextAgents: crossChecking
      ? ["verification", "action_planner"]
      : ["evidence", "investigation", "risk"],
    data: {
      timeline: checks,
      disputedTotal: total,
      statementId: statement?.id ?? null,
      statementCrossCheck: {
        matched: matchCount,
        expected: state.transactions.length,
        passed: crossCheckPassed,
      },
    },
  });
}

export async function runEvidenceAgent(
  state: CaseState,
  assignedTask: AgentTask,
): Promise<AgentResult> {
  const evidenceIds = state.evidence.map((item) => item.id);
  const statement = state.evidence.find(
    (item) => item.id === "E01" && /bank statement/i.test(item.title),
  );
  return result(state, {
    agent: "evidence",
    task: assignedTask.description,
    summary: `Located ${state.evidence.length} existing evidence items${statement ? ", including E01 Bank Statement" : ""}; no external bank connection was used.`,
    findings: [
      finding(
        "evidence",
        "Existing evidence catalogued",
        `${evidenceIds.join(", ") || "No evidence"} are available in the case record. ${statement ? "E01 is the source for statement line verification." : "A bank statement is not currently available."}`,
        statement ? "medium" : "high",
        statement ? 0.98 : 0.5,
        evidenceIds,
      ),
    ],
    evidenceIds,
    confidence: statement ? 0.98 : 0.5,
    nextAgents: ["transaction_forensics", "investigation", "verification"],
    data: {
      selectedBankStatement: statement
        ? { id: statement.id, title: statement.title, transactionIds: statement.transactionIds }
        : null,
      evidenceCatalog: state.evidence,
    },
  });
}

export async function runInvestigationAgent(
  state: CaseState,
  assignedTask: AgentTask,
): Promise<AgentResult> {
  const linkedEvidence = state.evidence
    .filter((item) => item.transactionIds.length > 0)
    .map((item) => item.id);
  return result(state, {
    agent: "investigation",
    task: assignedTask.description,
    summary: `The customer disputes three ATM withdrawals on ${state.account} within five minutes. The reported combined amount is INR ${state.disputedAmount.toLocaleString("en-IN")}; E01 and E02 are linked to the transaction set and E03 records the complaint acknowledgement.`,
    findings: [
      finding(
        "investigation",
        "Disputed withdrawal sequence documented",
        "The case record contains three disputed ATM withdrawals at 02:11, 02:13, and 02:16. This is a factual case summary, not a finding of criminal responsibility.",
        "high",
        0.93,
        linkedEvidence,
      ),
    ],
    evidenceIds: state.evidence.map((item) => item.id),
    confidence: 0.93,
    nextAgents: ["risk", "compliance", "verification"],
    data: {
      timeline: state.transactions.map(({ id: transactionId, time, amount, channel }) => ({
        transactionId,
        time,
        amount,
        channel,
      })),
      evidenceLinks: state.evidence.map((item) => ({
        evidenceId: item.id,
        transactionIds: item.transactionIds,
      })),
    },
  });
}

export async function runRiskAgent(
  state: CaseState,
  assignedTask: AgentTask,
): Promise<AgentResult> {
  return result(state, {
    agent: "risk",
    task: assignedTask.description,
    summary: "High operational priority due to rapid, repeated disputed cash withdrawals; human review is needed before any consequential action.",
    findings: [
      finding(
        "risk",
        "Elevated disputed-loss and recurrence risk",
        `Three disputed cash withdrawals total INR ${state.disputedAmount.toLocaleString("en-IN")}. Preserve evidence and route any financial or customer-impacting action for authorized human review.`,
        "high",
        0.9,
        ["E01", "E02"].filter((evidenceId) =>
          state.evidence.some((item) => item.id === evidenceId),
        ),
      ),
    ],
    confidence: 0.9,
    nextAgents: ["compliance", "action_planner", "verification"],
    data: { riskLevel: "high", irreversibleActionsAllowed: false },
  });
}

export async function runComplianceAgent(
  state: CaseState,
  assignedTask: AgentTask,
): Promise<AgentResult> {
  return result(state, {
    agent: "compliance",
    task: assignedTask.description,
    summary: "Investigation and evidence preparation are permitted; account restrictions, funds movement, legal submissions, and external contact remain outside autonomous authority.",
    findings: [
      finding(
        "compliance",
        "Human authorization boundary applied",
        "No account freeze, fund transfer, accusation, legally binding complaint, or authority contact is initiated by this system. Consequential recommendations require an authorized reviewer.",
        "medium",
        1,
        [],
      ),
    ],
    confidence: 1,
    nextAgents: ["action_planner", "verification"],
    data: {
      prohibitedAutonomousActions: ["transfer_funds", "freeze_account", "accuse_person", "submit_legal_complaint", "contact_authorities"],
      regulatoryStatus: "Official source verification required",
    },
  });
}

export async function runFollowUpAgent(
  state: CaseState,
  assignedTask: AgentTask,
): Promise<AgentResult> {
  const followUpAction = action(
    "Review customer follow-up draft",
    "Review a proposed case-status update before any customer contact. No message is sent automatically.",
    "customer",
    "required",
    state.evidence.map((item) => item.id),
  );
  return result(state, {
    agent: "follow_up",
    task: assignedTask.description,
    summary: "Prepared a customer follow-up recommendation for human review; no external contact was made.",
    actions: [followUpAction],
    evidenceIds: state.evidence.map((item) => item.id),
    confidence: 0.9,
    nextAgents: [],
    data: { externalContactMade: false, requiresHumanApproval: true },
  });
}

export async function runRecoveryAgent(
  state: CaseState,
  assignedTask: AgentTask,
): Promise<AgentResult> {
  const recoveryAction = action(
    "Review recovery options",
    `Review recovery options for the disputed INR ${state.disputedAmount.toLocaleString("en-IN")}. This is a recommendation only; no funds are transferred or recovery claim submitted.`,
    "financial",
    "required",
    state.evidence.map((item) => item.id),
  );
  return result(state, {
    agent: "recovery",
    task: assignedTask.description,
    summary: "Prepared recovery options for authorized human review; no financial action was taken.",
    actions: [recoveryAction],
    evidenceIds: state.evidence.map((item) => item.id),
    confidence: 0.9,
    nextAgents: [],
    data: { fundsTransferred: false, requiresHumanApproval: true },
  });
}

export async function runActionPlannerAgent(
  state: CaseState,
  assignedTask: AgentTask,
): Promise<AgentResult> {
  const evidencePackage = /package|additional evidence/i.test(assignedTask.description);
  const packageEvidenceIds = state.evidence
    .filter((item) => item.id === "E01" && /bank statement/i.test(item.title))
    .map((item) => item.id);
  const requiredChecks = [
    "disputed_transaction_count",
    "disputed_amount_total",
    "bank_statement_transaction_lines",
  ];
  const verificationPassed = requiredChecks.every((check) =>
    state.verifications.some((item) => item.check === check && item.status === "verified"),
  );
  const packageReady =
    evidencePackage && packageEvidenceIds.length === 1 && verificationPassed;
  const packageId = id("evidence-package");
  const actions = evidencePackage
    ? [
        action(
          packageReady ? "Human review of verified bank evidence package" : "Human review of evidence readiness",
          packageReady
            ? "Review the verified statement cross-check and authorize any subsequent external response. No complaint or bank communication is sent automatically."
            : "The evidence package is blocked until E01 is found and all transaction and total checks pass. No external submission or financial action is permitted.",
          "review",
          "required",
          packageEvidenceIds,
        ),
      ]
    : [
        action(
          "Review disputed transaction investigation",
          "Review the reconstructed timeline, available evidence, and recommended next steps before any customer-impacting or financial decision.",
          "review",
          "required",
          state.evidence.map((item) => item.id),
        ),
      ];

  return result(state, {
    agent: "action_planner",
    task: assignedTask.description,
    summary: packageReady
      ? "Prepared the verified evidence package and created a pending human-review action; no external submission or financial action was taken."
      : evidencePackage
        ? "Evidence package preparation is blocked because the statement or required verification checks are missing; a human review action remains pending."
      : "Prepared a human-review recommendation for the investigation; no consequential action was taken.",
    evidenceIds: packageReady
      ? [...packageEvidenceIds, packageId]
      : evidencePackage
        ? packageEvidenceIds
        : state.evidence.map((item) => item.id),
    actions,
    confidence: evidencePackage && !packageReady ? 0.5 : 0.95,
    nextAgents: ["verification"],
    data: packageReady
      ? {
          evidencePackage: {
            id: packageId,
            caseId: state.caseId,
            evidenceIds: packageEvidenceIds,
            transactionIds: state.transactions.map((transaction) => transaction.id),
            disputedAmount: state.disputedAmount,
            verificationIds: state.verifications
              .filter((item) => item.status === "verified")
              .map((item) => item.id),
            status: "prepared_for_human_review",
          },
          requiresHumanApproval: true,
        }
      : { requiresHumanApproval: true, packageBlocked: evidencePackage },
  });
}

export async function runVerificationAgent(
  state: CaseState,
  assignedTask: AgentTask,
): Promise<AgentResult> {
  const transactionTotal = state.transactions.reduce(
    (sum, transaction) => sum + transaction.amount,
    0,
  );
  const statement = state.evidence.find((item) => item.id === "E01");
  const statementMatches = Boolean(statement) && state.transactions.every(
    (transaction) =>
      statement?.description.includes(transaction.time) &&
      statement.description.includes(transaction.amount.toLocaleString("en-IN")),
  );
  const transactionCountCheck = verification(
    "disputed_transaction_count",
    state.transactions.length === state.disputedTransactionCount ? "verified" : "failed",
    String(state.disputedTransactionCount),
    String(state.transactions.length),
    "Count of disputed transactions in the case record.",
  );
  const totalCheck = verification(
    "disputed_amount_total",
    transactionTotal === state.disputedAmount ? "verified" : "failed",
    `INR ${state.disputedAmount.toLocaleString("en-IN")}`,
    `INR ${transactionTotal.toLocaleString("en-IN")}`,
    "Arithmetic sum of the disputed transactions.",
  );
  const statementCheck = verification(
    "bank_statement_transaction_lines",
    statementMatches ? "verified" : statement ? "failed" : "needs_review",
    `${state.transactions.length} transaction lines matching E01`,
    statementMatches ? `${state.transactions.length} matched` : statement ? "Not all lines matched" : "E01 not found",
    statement
      ? "Compared each synthetic disputed transaction time and amount against E01 Bank Statement."
      : "No bank statement was available for cross-check.",
    statement ? [statement.id] : [],
  );
  const verifications = [transactionCountCheck, totalCheck, statementCheck];
  const allPassed = verifications.every((item) => item.status === "verified");

  return result(state, {
    agent: "verification",
    task: assignedTask.description,
    summary: allPassed
      ? `Verified ${state.transactions.length} disputed transaction lines and the INR ${transactionTotal.toLocaleString("en-IN")} total against E01.`
      : "One or more verification checks need review; no evidence package should be submitted until resolved.",
    evidenceIds: statement ? [statement.id] : [],
    confidence: allPassed ? 0.99 : 0.55,
    nextAgents: allPassed ? ["action_planner"] : ["evidence", "transaction_forensics"],
    data: { verifications, verified: allPassed },
  });
}

export async function runReplannerAgent(
  state: CaseState,
  assignedTask: AgentTask,
  event: CaseEvent,
): Promise<AgentResult> {
  const statement = state.evidence.find(
    (item) => item.id === "E01" && /bank statement/i.test(item.title),
  );
  const plannedTasks = [
    task(
      "evidence",
      "Search existing case evidence for bank statement",
      "Search case evidence for E01 Bank Statement and link it to all disputed transaction IDs.",
    ),
    task(
      "transaction_forensics",
      "Cross-check disputed transactions against E01",
      "Cross-check each disputed transaction time and amount against E01 Bank Statement; calculate and compare the INR 60,700 total.",
    ),
    task(
      "verification",
      "Verify bank response evidence requirements",
      "Verify each of the three bank statement lines and the disputed total of INR 60,700.",
    ),
    task(
      "action_planner",
      "Prepare evidence package for human review",
      "Prepare an evidence package from verified E01 lines and create a human-review action requiring approval.",
    ),
  ];
  const resultValue = await result(state, {
    agent: "replanner",
    task: assignedTask.description,
    summary: statement
      ? "Bank response changed the evidence requirement. Replanned around locating E01, matching all disputed transactions, verifying the total, and preparing a human-review package."
      : "Bank response changed the evidence requirement. Replanned to search for the statement first, then cross-check and verify before any package can be prepared.",
    evidenceIds: statement ? [statement.id] : [],
    tasks: plannedTasks,
    confidence: statement ? 0.99 : 0.7,
    nextAgents: plannedTasks.map((item) => item.agent),
    useGroq: true,
    data: {
      triggerEventId: event.id,
      priorPlanInsufficient: true,
      reason: "Bank requested additional evidence after the initial investigation.",
      plan: plannedTasks.map(({ id: taskId, agent, title, description }) => ({
        id: taskId,
        agent,
        title,
        description,
      })),
      statementFoundBeforeExecution: Boolean(statement),
    },
  });
  return resultValue;
}

export async function runSupervisorAgent(
  state: CaseState,
  assignedTask: AgentTask,
  selectedAgents: AgentName[],
): Promise<AgentResult> {
  return result(state, {
    agent: "supervisor",
    task: assignedTask.description,
    summary: selectedAgents.length
      ? `Observed case revision ${state.revision} and selected only the outstanding work: ${selectedAgents.join(", ")}.`
      : `Observed case revision ${state.revision}; no additional agent work is required.`,
    confidence: 0.99,
    nextAgents: selectedAgents,
    data: {
      observedRevision: state.revision,
      existingFindings: state.findings.length,
      existingEvidence: state.evidence.length,
      completedAgents: state.agentResults.map((run) => run.agent),
      pendingTasks: state.tasks.filter((item) => item.status === "pending").map((item) => item.id),
      newEvents: state.events.map((item) => ({ id: item.id, eventType: item.eventType })),
      selectedAgents,
    },
  });
}
