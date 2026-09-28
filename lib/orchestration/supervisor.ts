import type { AgentName, AgentTask, CaseEvent, CaseState } from "@/lib/types/agents";

export interface SupervisorStep {
  agent: AgentName;
  task: AgentTask;
  event: CaseEvent | null;
  reason: string;
}

const makeTask = (agent: AgentName, title: string, description: string): AgentTask => ({
  id: `task-${crypto.randomUUID()}`,
  agent,
  title,
  description,
  status: "pending",
  createdAt: new Date().toISOString(),
});

function hasCompletedAgent(
  state: CaseState,
  agent: AgentName,
  event: CaseEvent | null,
): boolean {
  return state.agentResults.some((run) => {
    if (run.agent !== agent || run.status !== "completed") return false;
    const runEventId = run.data?.triggerEventId;
    return event ? runEventId === event.id : !runEventId;
  });
}

function hasFindingFrom(state: CaseState, agent: AgentName): boolean {
  return state.findings.some((finding) => finding.sourceAgent === agent);
}

function nextEventStep(
  state: CaseState,
  event: CaseEvent,
  attempted: Set<string>,
): SupervisorStep | null {
  const attemptedKey = (agent: AgentName) => `${event.id}:${agent}`;
  if (!hasCompletedAgent(state, "replanner", event)) {
    if (attempted.has(attemptedKey("replanner"))) return null;
    return {
      agent: "replanner",
      task: makeTask(
        "replanner",
        "Replan for bank evidence request",
        `Inspect the new bank response: ${event.description}`,
      ),
      event,
      reason:
        "A new bank-response event changes the outstanding evidence requirement; the previous investigation plan is insufficient.",
    };
  }

  const plan = state.agentResults.find(
    (run) => run.agent === "replanner" && run.data?.triggerEventId === event.id,
  );
  for (const plannedTask of plan?.tasks ?? []) {
    if (hasCompletedAgent(state, plannedTask.agent, event)) continue;
    if (attempted.has(attemptedKey(plannedTask.agent))) continue;
    return {
      agent: plannedTask.agent,
      task: plannedTask,
      event,
      reason: `The revised plan still has a pending task: ${plannedTask.title}.`,
    };
  }
  return null;
}

export function selectSupervisorStep(
  state: CaseState,
  attempted: Set<string>,
): SupervisorStep | null {
  const newBankEvent = [...state.events]
    .reverse()
    .find((event) => event.eventType === "bank_response");
  if (newBankEvent) {
    return nextEventStep(state, newBankEvent, attempted);
  }

  const missing = (agent: AgentName) =>
    !hasCompletedAgent(state, agent, null) && !attempted.has(`initial:${agent}`);
  const hasTriage =
    hasCompletedAgent(state, "triage", null) || hasFindingFrom(state, "triage");
  const hasForensics =
    hasCompletedAgent(state, "transaction_forensics", null) ||
    hasFindingFrom(state, "transaction_forensics");
  const hasEvidence =
    hasCompletedAgent(state, "evidence", null) || hasFindingFrom(state, "evidence");
  const pendingByAgent = (agent: AgentName) =>
    state.tasks.find((item) => item.agent === agent && item.status === "pending");

  if (state.transactions.length > 0 && missing("triage")) {
    return {
      agent: "triage",
      task:
        pendingByAgent("triage") ??
        makeTask("triage", "Triage disputed case", "Classify the disputed activity and set investigation priority."),
      event: null,
      reason: "No completed triage exists for this case.",
    };
  }

  const candidates: Array<{ agent: AgentName; title: string; description: string; condition: boolean }> = [
    {
      agent: "transaction_forensics",
      title: "Reconstruct disputed transaction timeline",
      description: "Classify each disputed transaction and reconstruct the event timeline.",
      condition: hasTriage && state.transactions.length > 0 && !hasForensics,
    },
    {
      agent: "evidence",
      title: "Map available case evidence",
      description: "Search existing case evidence and link it to the disputed transactions.",
      condition: hasTriage && state.evidence.length > 0 && !hasEvidence,
    },
    {
      agent: "investigation",
      title: "Synthesize investigation findings",
      description: "Combine the transaction timeline, evidence links, and case events into a factual summary.",
      condition: hasForensics && hasEvidence && missing("investigation"),
    },
    {
      agent: "risk",
      title: "Assess case risk indicators",
      description: "Identify operational and financial risk indicators without making an accusation.",
      condition:
        state.disputedAmount > 0 &&
        (state.findings.some((item) => item.severity === "high" || item.severity === "critical") || hasForensics) &&
        missing("risk"),
    },
    {
      agent: "compliance",
      title: "Check human-control requirements",
      description: "Apply the case's human approval and prohibited-action boundaries.",
      condition: (state.findings.length > 0 || state.events.length > 0) && missing("compliance"),
    },
    {
      agent: "action_planner",
      title: "Prepare recommended case actions",
      description: "Prepare reversible investigation recommendations and route consequential decisions for approval.",
      condition: state.findings.length > 0 && state.actions.length === 0 && missing("action_planner"),
    },
    {
      agent: "verification",
      title: "Verify case totals and evidence links",
      description: "Verify the disputed transaction count, aggregate amount, and available evidence links.",
      condition:
        state.transactions.length > 0 &&
        state.findings.length > 0 &&
        state.actions.length > 0 &&
        state.verifications.length === 0 &&
        missing("verification"),
    },
  ];

  for (const candidate of candidates) {
    if (!candidate.condition || !missing(candidate.agent)) continue;
    return {
      agent: candidate.agent,
      task:
        pendingByAgent(candidate.agent) ??
        makeTask(candidate.agent, candidate.title, candidate.description),
      event: null,
      reason: `Case state indicates ${candidate.agent.replaceAll("_", " ")} work is still required.`,
    };
  }

  return null;
}
