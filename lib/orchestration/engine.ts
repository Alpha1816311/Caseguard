import {
  runActionPlannerAgent,
  runComplianceAgent,
  runEvidenceAgent,
  runForensicsAgent,
  runInvestigationAgent,
  runReplannerAgent,
  runRiskAgent,
  runSupervisorAgent,
  runTriageAgent,
  runVerificationAgent,
} from "@/lib/agents/agents";
import {
  loadCaseState,
  makeAgentRun,
  persistAgentRun,
  persistCaseEvent,
  saveCaseState,
  type CaseDatabaseClient,
} from "@/lib/case/store";
import { selectSupervisorStep } from "@/lib/orchestration/supervisor";
import type {
  AgentName,
  AgentResult,
  AgentTask,
  CaseEvent,
  CaseEvidence,
  CaseState,
  PersistenceWarning,
} from "@/lib/types/agents";

export interface OrchestrationOutcome {
  state: CaseState;
  persistenceWarnings: PersistenceWarning[];
  agentErrors: Array<{ agent: AgentName; message: string }>;
  executedAgents: AgentName[];
}

const taskStatus = (task: AgentTask, status: AgentTask["status"]): AgentTask => ({
  ...task,
  status,
  ...(status === "completed" ? { completedAt: new Date().toISOString() } : {}),
});

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function failedResult(agent: AgentName, error: unknown): { result: AgentResult; message: string } {
  const message = error instanceof Error ? error.message : "Unknown agent execution error.";
  return {
    message,
    result: {
      agent,
      status: "failed",
      summary: `${agent} execution failed: ${message}`,
      findings: [],
      evidenceIds: [],
      tasks: [],
      actions: [],
      confidence: 0,
      nextAgents: [],
      data: { error: message },
    },
  };
}

async function callAgent(
  agent: AgentName,
  state: CaseState,
  task: AgentTask,
  event: CaseEvent | null,
  selectedAgents: AgentName[],
): Promise<AgentResult> {
  switch (agent) {
    case "supervisor":
      return runSupervisorAgent(state, task, selectedAgents);
    case "triage":
      return runTriageAgent(state, task);
    case "transaction_forensics":
      return runForensicsAgent(state, task);
    case "evidence":
      return runEvidenceAgent(state, task);
    case "investigation":
      return runInvestigationAgent(state, task);
    case "risk":
      return runRiskAgent(state, task);
    case "compliance":
      return runComplianceAgent(state, task);
    case "action_planner":
      return runActionPlannerAgent(state, task);
    case "verification":
      return runVerificationAgent(state, task);
    case "replanner":
      if (!event) throw new Error("Replanner requires a triggering case event.");
      return runReplannerAgent(state, task, event);
  }
}

async function executeAgent(
  client: CaseDatabaseClient,
  state: CaseState,
  agent: AgentName,
  task: AgentTask,
  event: CaseEvent | null,
  selectedAgents: AgentName[],
  outcome: OrchestrationOutcome,
): Promise<void> {
  const startedAt = new Date().toISOString();
  const inputState = structuredClone(state);
  let result: AgentResult;
  let errorMessage: string | null = null;
  try {
    result = await callAgent(agent, state, task, event, selectedAgents);
  } catch (error) {
    const failed = failedResult(agent, error);
    result = failed.result;
    errorMessage = failed.message;
    outcome.agentErrors.push({ agent, message: failed.message });
  }
  if (event) {
    result.data = { ...result.data, triggerEventId: event.id };
  }
  const completedAt = new Date().toISOString();
  const completedTask = taskStatus(task, result.status === "completed" ? "completed" : "blocked");

  state.agentResults = [...state.agentResults, result];
  state.findings = uniqueById([...state.findings, ...result.findings]);
  state.tasks = uniqueById([
    ...state.tasks.filter((item) => item.id !== task.id),
    completedTask,
    ...result.tasks,
  ]);
  state.actions = uniqueById([...state.actions, ...result.actions]);
  const evidencePackage = result.data?.evidencePackage as
    | {
        id?: unknown;
        status?: unknown;
        transactionIds?: unknown;
        evidenceIds?: unknown;
      }
    | undefined;
  if (
    typeof evidencePackage?.id === "string" &&
    evidencePackage.status === "prepared_for_human_review"
  ) {
    const packageEvidence: CaseEvidence = {
      id: evidencePackage.id,
      title: "Verified Evidence Package",
      kind: "verified_evidence_package",
      description:
        "E01 statement lines matched to the disputed transactions and verified for human review; not submitted externally.",
      transactionIds: Array.isArray(evidencePackage.transactionIds)
        ? evidencePackage.transactionIds.filter(
            (transactionId): transactionId is string => typeof transactionId === "string",
          )
        : [],
      verified: true,
    };
    state.evidence = uniqueById([...state.evidence, packageEvidence]);
  }
  const verifications = (result.data?.verifications ?? []) as CaseState["verifications"];
  state.verifications = uniqueById([...state.verifications, ...verifications]);
  const caseEvent: CaseEvent = {
    id: `event-${crypto.randomUUID()}`,
    caseId: state.caseId,
    eventType: result.status === "failed" ? "agent_failed" : "agent_completed",
    description: `${agent} ${result.status === "failed" ? "failed" : "completed"}: ${task.title}`,
    metadata: {
      agent,
      taskId: task.id,
      status: result.status,
      findingIds: result.findings.map((item) => item.id),
      actionIds: result.actions.map((item) => item.id),
      evidenceIds: result.evidenceIds,
      triggerEventId: event?.id ?? null,
      requiresHumanApproval: result.actions.some((item) => item.approval === "required"),
    },
    createdAt: completedAt,
  };
  state.events = uniqueById([...state.events, caseEvent]);
  state.revision += 1;
  state.updatedAt = completedAt;
  saveCaseState(state);

  const run = makeAgentRun(
    state.caseId,
    agent,
    task,
    inputState,
    result,
    startedAt,
    completedAt,
    errorMessage,
  );
  outcome.persistenceWarnings.push(
    ...(await persistAgentRun(client, run, completedTask, result)),
    ...(await persistCaseEvent(client, caseEvent)),
  );
  outcome.executedAgents.push(agent);
}

function latestBankResponse(state: CaseState): CaseEvent | null {
  return (
    [...state.events]
      .reverse()
      .find((event) => event.eventType === "bank_response") ?? null
  );
}

export function hasPendingReplan(state: CaseState): boolean {
  const event = latestBankResponse(state);
  if (!event) return false;
  const plannerResult = state.agentResults.find(
    (run) =>
      run.agent === "replanner" &&
      run.status === "completed" &&
      run.data?.triggerEventId === event.id,
  );
  if (!plannerResult) return true;
  return plannerResult.tasks.some(
    (task) =>
      !state.agentResults.some(
        (run) =>
          run.agent === task.agent &&
          run.status === "completed" &&
          run.data?.triggerEventId === event.id,
      ),
  );
}

async function advance(
  client: CaseDatabaseClient,
  caseId: string,
): Promise<OrchestrationOutcome> {
  const loaded = await loadCaseState(client, caseId);
  const outcome: OrchestrationOutcome = {
    state: loaded.state,
    persistenceWarnings: [...loaded.warnings],
    agentErrors: [],
    executedAgents: [],
  };
  const attempted = new Set<string>();

  for (let iteration = 0; iteration < 24; iteration += 1) {
    const step = selectSupervisorStep(outcome.state, attempted);
    if (!step) break;

    const decisionTask: AgentTask = {
      id: `task-${crypto.randomUUID()}`,
      agent: "supervisor",
      title: "Observe case state and select required work",
      description: `${step.reason} Next task: ${step.task.title}`,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    await executeAgent(
      client,
      outcome.state,
      "supervisor",
      decisionTask,
      step.event,
      [step.agent],
      outcome,
    );
    await executeAgent(
      client,
      outcome.state,
      step.agent,
      step.task,
      step.event,
      [step.agent],
      outcome,
    );
    attempted.add(`${step.event?.id ?? "initial"}:${step.agent}`);
  }

  if (outcome.executedAgents.length >= 48) {
    outcome.agentErrors.push({
      agent: "supervisor",
      message: "Orchestration stopped at the maximum execution limit.",
    });
  }
  outcome.persistenceWarnings = [
    ...new Map(
      outcome.persistenceWarnings.map((warning) => [
        `${warning.table}:${warning.message}`,
        warning,
      ]),
    ).values(),
  ];
  saveCaseState(outcome.state);
  return outcome;
}

export async function investigateCase(
  client: CaseDatabaseClient,
  caseId: string,
): Promise<OrchestrationOutcome> {
  return advance(client, caseId);
}

export async function replanCase(
  client: CaseDatabaseClient,
  caseId: string,
): Promise<OrchestrationOutcome> {
  const loaded = await loadCaseState(client, caseId);
  if (!hasPendingReplan(loaded.state)) {
    return {
      state: loaded.state,
      persistenceWarnings: loaded.warnings,
      agentErrors: [],
      executedAgents: [],
    };
  }
  return advance(client, caseId);
}

export async function recordCaseEvent(
  client: CaseDatabaseClient,
  state: CaseState,
  event: CaseEvent,
): Promise<PersistenceWarning[]> {
  state.events = uniqueById([...state.events, event]);
  state.revision += 1;
  state.updatedAt = event.createdAt;
  saveCaseState(state);
  return persistCaseEvent(client, event);
}
