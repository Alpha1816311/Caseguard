import { createClient } from "@/lib/supabase/server";
import { syntheticCase } from "@/lib/case/synthetic";
import type {
  AgentName,
  AgentResult,
  AgentRunRecord,
  AgentTask,
  CaseEvent,
  CaseEvidence,
  CaseState,
  CaseTransaction,
  InvestigationFinding,
  PersistenceWarning,
  RecommendedAction,
  VerificationResult,
} from "@/lib/types/agents";

export type CaseDatabaseClient = Awaited<ReturnType<typeof createClient>>;

type DatabaseResponse<T> = {
  data: T | null;
  error: { message: string; code?: string } | null;
};

type DatabaseQuery = {
  select: (columns?: string) => DatabaseQuery;
  eq: (column: string, value: string) => DatabaseQuery;
  limit: (count: number) => PromiseLike<DatabaseResponse<Record<string, unknown>[]>>;
  insert: (
    values: Record<string, unknown> | Record<string, unknown>[],
  ) => PromiseLike<DatabaseResponse<unknown>>;
};

type DatabaseClient = {
  from: (table: string) => DatabaseQuery;
};

type CaseStoreGlobal = typeof globalThis & {
  __caseguardCaseCache?: Map<string, CaseState>;
};

const globalStore = globalThis as CaseStoreGlobal;
const caseCache = (globalStore.__caseguardCaseCache ??= new Map());
const tableNames = [
  "cases",
  "transactions",
  "evidence",
  "agent_runs",
  "tasks",
  "findings",
  "actions",
  "verification_results",
  "case_events",
] as const;

function db(client: CaseDatabaseClient): DatabaseClient {
  return client as unknown as DatabaseClient;
}

function record(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      return record(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numeric(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const values = new Map<string, T>();
  for (const item of items) values.set(key(item), item);
  return [...values.values()];
}

function normalizeTransaction(row: Record<string, unknown>): CaseTransaction | null {
  const amount = numeric(row.amount ?? row.transaction_amount, Number.NaN);
  if (!Number.isFinite(amount)) return null;
  const rawTime = text(row.time ?? row.transaction_time ?? row.occurred_at ?? row.created_at);
  const timeMatch = rawTime.match(/\b(\d{2}:\d{2})/);
  const disputed = row.disputed ?? row.is_disputed;
  return {
    id: text(row.transaction_id ?? row.id, `TX-${crypto.randomUUID()}`),
    time: timeMatch?.[1] ?? rawTime,
    amount,
    currency: "INR",
    channel: text(row.channel ?? row.type ?? row.transaction_type, "ATM"),
    account: text(row.account ?? row.account_number, syntheticCase.account),
    disputed: typeof disputed === "boolean" ? disputed : true,
    classification: text(row.classification),
  };
}

function normalizeEvidence(row: Record<string, unknown>): CaseEvidence | null {
  const evidenceId = text(row.evidence_id ?? row.reference ?? row.code ?? row.id);
  const title = text(row.title ?? row.name ?? row.evidence_type);
  if (!evidenceId || !title) return null;
  const related = row.transaction_ids ?? row.transactionIds;
  return {
    id: evidenceId,
    title,
    kind: text(row.kind ?? row.type ?? row.evidence_type, "case_evidence"),
    description: text(row.description ?? row.content ?? row.notes),
    transactionIds: list(related).filter((id): id is string => typeof id === "string"),
    verified: row.verified === true,
  };
}

function normalizeFinding(row: Record<string, unknown>): InvestigationFinding | null {
  const title = text(row.title);
  if (!title) return null;
  const severity = text(row.severity, "medium");
  return {
    id: text(row.id, `finding-${crypto.randomUUID()}`),
    title,
    description: text(row.description),
    severity: ["low", "medium", "high", "critical"].includes(severity)
      ? (severity as InvestigationFinding["severity"])
      : "medium",
    confidence: numeric(row.confidence, 0.5),
    sourceAgent: text(row.source_agent ?? row.agent_name, "investigation") as AgentName,
    evidenceIds: list(row.evidence_ids).filter((id): id is string => typeof id === "string"),
    createdAt: text(row.created_at, new Date(0).toISOString()),
  };
}

function normalizeTask(row: Record<string, unknown>): AgentTask | null {
  const title = text(row.title ?? row.task);
  if (!title) return null;
  const agent = text(row.agent ?? row.agent_name ?? row.assigned_agent, "supervisor");
  const status = text(row.status, "pending");
  return {
    id: text(row.task_id ?? row.id, `task-${title}`),
    agent: agent as AgentName,
    title,
    description: text(row.description ?? row.details),
    status: ["pending", "in_progress", "completed", "blocked"].includes(status)
      ? (status as AgentTask["status"])
      : "pending",
    createdAt: text(row.created_at, new Date(0).toISOString()),
    ...(typeof row.completed_at === "string" ? { completedAt: row.completed_at } : {}),
  };
}

function normalizeAction(row: Record<string, unknown>): RecommendedAction | null {
  const title = text(row.title ?? row.action);
  if (!title) return null;
  const approval = row.requires_human_approval === true || row.approval === "required"
    ? "required"
    : "not_required";
  const status = text(row.status, approval === "required" ? "pending_approval" : "prepared");
  const category = text(row.category, "review");
  return {
    id: text(row.action_id ?? row.id, `action-${title}`),
    title,
    description: text(row.description),
    category: ["evidence", "review", "customer", "financial", "legal"].includes(category)
      ? (category as RecommendedAction["category"])
      : "review",
    approval,
    status: ["prepared", "pending_approval", "approved", "rejected"].includes(status)
      ? (status as RecommendedAction["status"])
      : "prepared",
    evidenceIds: list(row.evidence_ids).filter((id): id is string => typeof id === "string"),
    createdAt: text(row.created_at, new Date(0).toISOString()),
  };
}

function normalizeVerification(row: Record<string, unknown>): VerificationResult | null {
  const check = text(row.check ?? row.check_name);
  if (!check) return null;
  const status = text(row.status, "needs_review");
  return {
    id: text(row.id, `verification-${check}`),
    check,
    status: ["verified", "failed", "needs_review"].includes(status)
      ? (status as VerificationResult["status"])
      : "needs_review",
    expected: text(row.expected),
    actual: text(row.actual),
    details: text(row.details),
    evidenceIds: list(row.evidence_ids).filter((id): id is string => typeof id === "string"),
    createdAt: text(row.created_at, new Date(0).toISOString()),
  };
}

function normalizeEvent(row: Record<string, unknown>): CaseEvent | null {
  const eventType = text(row.event_type ?? row.type);
  if (!eventType) return null;
  const metadata = record(row.metadata) ?? {};
  return {
    id: text(
      row.demo_event_id ?? metadata.demo_event_id ?? row.event_id ?? row.id,
      `event-${crypto.randomUUID()}`,
    ),
    caseId: text(row.case_id, syntheticCase.caseId),
    eventType,
    description: text(row.description ?? row.message),
    metadata,
    createdAt: text(row.created_at, new Date(0).toISOString()),
  };
}

function normalizeAgentResult(value: unknown): AgentResult | null {
  const output = record(value);
  if (
    !output ||
    typeof output.agent !== "string" ||
    typeof output.summary !== "string" ||
    !Array.isArray(output.findings) ||
    !Array.isArray(output.evidenceIds) ||
    !Array.isArray(output.tasks) ||
    !Array.isArray(output.actions)
  ) {
    return null;
  }
  return output as unknown as AgentResult;
}

function normalizeAgentRun(row: Record<string, unknown>): AgentResult | null {
  const output = normalizeAgentResult(row.output);
  if (!output) return null;
  return output;
}

async function readTable(
  client: CaseDatabaseClient,
  table: (typeof tableNames)[number],
  caseId: string,
  warnings: PersistenceWarning[],
): Promise<Record<string, unknown>[]> {
  try {
    const response = await db(client)
      .from(table)
      .select("*")
      .eq("case_id", caseId)
      .limit(500);
    if (response.error) {
      warnings.push({ table, message: response.error.message });
      return [];
    }
    return response.data ?? [];
  } catch (error) {
    warnings.push({
      table,
      message: error instanceof Error ? error.message : "Unknown Supabase read error.",
    });
    return [];
  }
}

export class CaseNotFoundError extends Error {
  constructor(caseId: string) {
    super(`Case ${caseId} was not found.`);
    this.name = "CaseNotFoundError";
  }
}

export class CaseDatabaseError extends Error {
  constructor(message: string) {
    super(`Could not read case state from Supabase: ${message}`);
    this.name = "CaseDatabaseError";
  }
}

export interface LoadedCase {
  state: CaseState;
  warnings: PersistenceWarning[];
}

export async function loadCaseState(
  client: CaseDatabaseClient,
  caseId: string,
): Promise<LoadedCase> {
  const warnings: PersistenceWarning[] = [];
  const tables = await Promise.all(
    tableNames.map(async (table) => [
      table,
      await readTable(client, table, caseId, warnings),
    ] as const),
  );
  const rows = Object.fromEntries(tables) as Record<
    (typeof tableNames)[number],
    Record<string, unknown>[]
  >;
  const caseRow = rows.cases[0];
  const cached = caseId === syntheticCase.caseId ? caseCache.get(caseId) : undefined;

  if (caseId !== syntheticCase.caseId && !caseRow && !cached) {
    const caseReadFailure = warnings.find((warning) => warning.table === "cases");
    if (caseReadFailure) throw new CaseDatabaseError(caseReadFailure.message);
    throw new CaseNotFoundError(caseId);
  }

  const base = cached
    ? structuredClone(cached)
    : caseId === syntheticCase.caseId
      ? structuredClone(syntheticCase)
      : {
          ...structuredClone(syntheticCase),
          caseId,
          account: text(caseRow?.account ?? caseRow?.account_number, "Unknown account"),
          status: text(caseRow?.status, "open"),
          disputedAmount: numeric(caseRow?.disputed_amount, 0),
          disputedTransactionCount: numeric(caseRow?.disputed_transaction_count, 0),
          transactions: [],
          evidence: [],
        };

  const databaseTransactions = rows.transactions
    .map(normalizeTransaction)
    .filter((item): item is CaseTransaction => item !== null && item.disputed);
  const databaseEvidence = rows.evidence
    .map(normalizeEvidence)
    .filter((item): item is CaseEvidence => Boolean(item));
  const databaseFindings = rows.findings
    .map(normalizeFinding)
    .filter((item): item is InvestigationFinding => Boolean(item));
  const databaseTasks = rows.tasks
    .map(normalizeTask)
    .filter((item): item is AgentTask => Boolean(item));
  const databaseActions = rows.actions
    .map(normalizeAction)
    .filter((item): item is RecommendedAction => Boolean(item));
  const databaseVerifications = rows.verification_results
    .map(normalizeVerification)
    .filter((item): item is VerificationResult => Boolean(item));
  const databaseEvents = rows.case_events
    .map(normalizeEvent)
    .filter((item): item is CaseEvent => Boolean(item));
  const databaseRuns = rows.agent_runs
    .map(normalizeAgentRun)
    .filter((item): item is AgentResult => Boolean(item));

  if (databaseTransactions.length > 0) {
    if (caseId === syntheticCase.caseId) {
      base.transactions = base.transactions.map((transaction: CaseTransaction) => {
        const matchingRow = databaseTransactions.find(
          (item) => item.time === transaction.time && item.amount === transaction.amount,
        );
        return matchingRow
          ? { ...transaction, classification: matchingRow.classification || transaction.classification }
          : transaction;
      });
    } else {
      base.transactions = uniqueBy(
        [...base.transactions, ...databaseTransactions],
        (item) => item.id,
      );
    }
  }
  base.evidence = uniqueBy([...databaseEvidence, ...base.evidence], (item) => item.id);
  base.findings = uniqueBy([...base.findings, ...databaseFindings], (item) => item.id);
  base.tasks = uniqueBy([...base.tasks, ...databaseTasks], (item) => item.id);
  base.actions = uniqueBy([...base.actions, ...databaseActions], (item) => item.id);
  base.verifications = uniqueBy(
    [...base.verifications, ...databaseVerifications],
    (item) => item.id,
  );
  base.events = uniqueBy([...base.events, ...databaseEvents], (item) => item.id).sort(
    (left, right) => left.createdAt.localeCompare(right.createdAt),
  );
  base.agentResults = uniqueBy(
    [...base.agentResults, ...databaseRuns],
    (item) => `${item.agent}:${item.data?.triggerEventId ?? "initial"}:${item.summary}`,
  );

  if (caseRow) {
    base.status = text(caseRow.status, base.status);
    base.account = text(caseRow.account ?? caseRow.account_number, base.account);
    base.disputedAmount = numeric(caseRow.disputed_amount, base.disputedAmount);
    base.disputedTransactionCount = numeric(
      caseRow.disputed_transaction_count,
      base.disputedTransactionCount,
    );
  }

  base.revision = base.events.length + base.agentResults.length;
  base.updatedAt = new Date().toISOString();
  if (caseId === syntheticCase.caseId) {
    caseCache.set(caseId, structuredClone(base));
  }
  return { state: base, warnings: uniqueBy(warnings, (item) => `${item.table}:${item.message}`) };
}

export function saveCaseState(state: CaseState): void {
  if (state.caseId === syntheticCase.caseId) {
    caseCache.set(state.caseId, structuredClone(state));
  }
}

async function insertRecord(
  client: CaseDatabaseClient,
  table: string,
  value: Record<string, unknown>,
): Promise<PersistenceWarning | null> {
  try {
    const response = await db(client).from(table).insert(value);
    if (response.error) return { table, message: response.error.message };
    return null;
  } catch (error) {
    return {
      table,
      message: error instanceof Error ? error.message : "Unknown Supabase write error.",
    };
  }
}

export async function persistAgentRun(
  client: CaseDatabaseClient,
  run: AgentRunRecord,
  assignedTask: AgentTask,
  result: AgentResult,
): Promise<PersistenceWarning[]> {
  const warnings: PersistenceWarning[] = [];
  const runWarning = await insertRecord(client, "agent_runs", run as unknown as Record<string, unknown>);
  if (runWarning) warnings.push(runWarning);

  const createdAt = new Date().toISOString();
  const taskRows = [
    {
      case_id: run.case_id,
      task: assignedTask.title,
      agent_name: assignedTask.agent,
      status: "completed",
      details: assignedTask.description,
      created_at: assignedTask.createdAt,
      completed_at: assignedTask.completedAt ?? run.completed_at,
    },
    ...result.tasks.map((item) => ({
      case_id: run.case_id,
      task: item.title,
      agent_name: item.agent,
      status: item.status,
      details: item.description,
      created_at: item.createdAt || createdAt,
      completed_at: item.completedAt ?? null,
    })),
  ];
  const writes: Array<[string, Record<string, unknown>]> = [
    ...taskRows.map((item) => ["tasks", item] as [string, Record<string, unknown>]),
    ...result.findings.map((item) => [
      "findings",
      {
        case_id: run.case_id,
        title: item.title,
        description: item.description,
        severity: item.severity,
        confidence: item.confidence,
        source_agent: item.sourceAgent,
        evidence_ids: item.evidenceIds,
        created_at: item.createdAt,
      },
    ] as [string, Record<string, unknown>]),
    ...result.actions.map((item) => [
      "actions",
      {
        case_id: run.case_id,
        title: item.title,
        description: item.description,
        category: item.category,
        requires_human_approval: item.approval === "required",
        status: item.status,
        evidence_ids: item.evidenceIds,
        created_at: item.createdAt,
      },
    ] as [string, Record<string, unknown>]),
    ...((result.data?.verifications as VerificationResult[] | undefined) ?? []).map((item) => [
      "verification_results",
      {
        case_id: run.case_id,
        check_name: item.check,
        status: item.status,
        expected: item.expected,
        actual: item.actual,
        details: item.details,
        evidence_ids: item.evidenceIds,
        created_at: item.createdAt,
      },
    ] as [string, Record<string, unknown>]),
  ];

  const evidencePackage = record(result.data?.evidencePackage);
  if (evidencePackage?.status === "prepared_for_human_review") {
    const packageId = text(evidencePackage.id);
    const transactionIds = list(evidencePackage.transactionIds).filter(
      (id): id is string => typeof id === "string",
    );
    writes.push([
      "evidence",
      {
        case_id: run.case_id,
        evidence_id: packageId,
        title: "Verified Evidence Package",
        kind: "verified_evidence_package",
        description: `E01 Bank Statement cross-checked against ${transactionIds.length} disputed transactions totaling INR ${numeric(evidencePackage.disputedAmount, 0).toLocaleString("en-IN")}. Prepared for human review; not submitted externally.`,
        transaction_ids: transactionIds,
        verified: true,
        created_at: createdAt,
      },
    ]);
  }

  const results = await Promise.all(
    writes.map(([table, value]) => insertRecord(client, table, value)),
  );
  warnings.push(...results.filter((item): item is PersistenceWarning => Boolean(item)));
  return uniqueBy(warnings, (item) => `${item.table}:${item.message}`);
}

export async function persistCaseEvent(
  client: CaseDatabaseClient,
  event: CaseEvent,
): Promise<PersistenceWarning[]> {
  const warning = await insertRecord(client, "case_events", {
    case_id: event.caseId,
    event_type: event.eventType,
    description: event.description,
    metadata: { ...event.metadata, demo_event_id: event.id },
    created_at: event.createdAt,
  });
  return warning ? [warning] : [];
}

export function makeAgentRun(
  caseId: string,
  agent: AgentName,
  assignedTask: AgentTask,
  state: CaseState,
  result: AgentResult,
  startedAt: string,
  completedAt: string,
  error: string | null = null,
): AgentRunRecord {
  return {
    case_id: caseId,
    agent_name: agent,
    task: assignedTask.description,
    input: {
      caseRevision: state.revision,
      disputedAmount: state.disputedAmount,
      transactionIds: state.transactions.map((item) => item.id),
      evidenceIds: state.evidence.map((item) => item.id),
      eventIds: state.events.map((item) => item.id),
    },
    output: result,
    status: result.status,
    started_at: startedAt,
    completed_at: completedAt,
    error,
  };
}
