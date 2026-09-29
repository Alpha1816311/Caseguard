import type { AgentName, AgentResult, CaseState } from "@/lib/types/agents";

function latestResult(state: CaseState, agent: AgentName): AgentResult | undefined {
  return [...state.agentResults]
    .reverse()
    .find((item) => item.agent === agent && item.status === "completed");
}

function isBankResponse(eventType: string): boolean {
  return eventType === "bank_response" || eventType === "BANK_RESPONSE_RECEIVED";
}

export function presentCaseState(state: CaseState) {
  const latestBankEvent = [...state.events].reverse().find((event) => isBankResponse(event.eventType));
  const replanResult = latestBankEvent
    ? [...state.agentResults].reverse().find(
        (item) => item.agent === "replanner" && item.data?.triggerEventId === latestBankEvent.id,
      )
    : undefined;
  const replanTasks = replanResult?.tasks ?? [];
  const replanPendingTasks = latestBankEvent
    ? replanTasks.filter(
        (task) =>
          !state.agentResults.some(
            (item) =>
              item.agent === task.agent &&
              item.status === "completed" &&
              item.data?.triggerEventId === latestBankEvent.id,
          ),
      )
    : [];
  const replanStatus = !latestBankEvent
    ? "not_required"
    : !replanResult || replanPendingTasks.length > 0
      ? "pending"
      : "completed";

  const verificationResult = latestResult(state, "verification");
  const isReplanning = Boolean(latestBankEvent && replanStatus !== "completed");
  const stage = isReplanning
    ? "replanning"
    : latestBankEvent && replanStatus === "completed"
      ? "human_review"
      : verificationResult?.data?.verified === true
        ? "complete"
        : "investigation";

  const riskResult = latestResult(state, "risk");
  const riskFinding = [...state.findings].reverse().find((item) => item.sourceAgent === "risk");
  const risk = {
    level:
      typeof riskResult?.data?.riskLevel === "string"
        ? riskResult.data.riskLevel
        : riskFinding?.severity ?? "unknown",
    summary: riskResult?.summary ?? riskFinding?.description ?? "Risk assessment is pending.",
  };

  const pendingTasks = state.tasks.filter((item) =>
    ["pending", "in_progress", "blocked"].includes(item.status),
  );
  const completedTasks = state.tasks.filter((item) => item.status === "completed");
  const actions = state.actions.map((item) => ({
    ...item,
    requires_approval: item.approval === "required",
  }));
  const humanReviewActions = actions.filter(
    (item) => item.approval === "required" && item.status === "pending_approval",
  );
  const packageResult = [...state.agentResults]
    .reverse()
    .find((item) => item.agent === "action_planner" && item.data?.evidencePackage);
  const evidencePackage = packageResult?.data?.evidencePackage ?? null;
  const outstandingRequirements = new Set<string>();

  for (const task of pendingTasks) {
    outstandingRequirements.add(task.title);
  }
  if (isReplanning) {
    outstandingRequirements.add("Complete the bank-requested evidence verification plan.");
  }
  for (const verification of state.verifications) {
    if (verification.status !== "verified") {
      outstandingRequirements.add(`${verification.check}: ${verification.details}`);
    }
  }
  if (humanReviewActions.length > 0) {
    outstandingRequirements.add("Authorized human review is required before consequential action.");
  }

  const complianceResult = latestResult(state, "compliance");
  const regulatoryOutput =
    typeof complianceResult?.data?.regulatoryStatus === "string"
      ? complianceResult.data.regulatoryStatus
      : "Official source verification required";

  return {
    ...state,
    status:
      stage === "complete"
        ? "complete"
        : stage === "human_review"
          ? "needs_human_review"
          : state.status,
    stage,
    currentStage: stage,
    risk,
    actions,
    pendingTasks,
    completedTasks,
    outstandingRequirements: [...outstandingRequirements],
    agentRuns: state.agentResults,
    verificationResults: state.verifications,
    regulatoryOutput,
    replan: {
      status: replanStatus,
      triggeringEventId: latestBankEvent?.id ?? null,
      summary: replanResult?.summary ?? null,
      pendingTasks: replanPendingTasks,
    },
    humanReview: {
      required: humanReviewActions.length > 0,
      status: humanReviewActions.length > 0 ? "pending" : "not_required",
      requires_approval: humanReviewActions.length > 0,
      actions: humanReviewActions,
      evidencePackage,
    },
  };
}