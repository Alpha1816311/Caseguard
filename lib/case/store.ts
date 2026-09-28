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

type DatabaseInsertQuery = PromiseLike<DatabaseResponse<unknown>> & {
  select: (columns?: string) => {
    single: () => PromiseLike<DatabaseResponse<Record<string, unknown>>>;
  };
};

type DatabaseQuery = {
  select: (columns?: string) => DatabaseQuery;
  eq: (column: string, value: string) => DatabaseQuery;
  limit: (count: number) => PromiseLike<DatabaseResponse<Record<string, unknown>[]>>;
  insert: (
    values: Record<string, unknown> | Record<string, unknown>[],
  ) => DatabaseInsertQuery;
};

type DatabaseClient = {
  from: (table: string) => DatabaseQuery;
};

type CaseStoreGlobal = typeof globalThis & {
  __caseguardCaseCache?: Map<string, CaseState>;
  __caseguardDatabaseCaseIds?: Map<string, string | null>;
};

const globalStore = globalThis as CaseStoreGlobal;
const caseCache = (globalStore.__caseguardCaseCache ??= new Map());
const databaseCaseIds = (globalStore.__caseguardDatabaseCaseIds ??= new Map());
const tableNames = [
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
  const amount = numeric(row.amount, Number.NaN);
  if (!Number.isFinite(amount)) return null;
  const rawTime = text(row.transaction_time ?? row.created_at);
  const timeMatch = rawTime.match(/\b(\d{2}:\d{2})/);
  const disputed = row.disputed;
  const metadata = record(row.metadata) ?? {};
  return {
    id: text(row.id, `TX-${crypto.randomUUID()}`),
    time: timeMatch?.[1] ?? rawTime,
    amount,
    currency: text(row.currency, "INR") as "INR",
    channel: text(row.channel ?? row.transaction_type, "ATM"),
    account: text(metadata.account, syntheticCase.account),
    disputed: typeof disputed === "boolean" ? disputed : true,
    classification: text(metadata.classification),
  };
}

function normalizeEvidence(row: Record<string, unknown>): CaseEvidence | null {
  const metadata = record(row.metadata) ?? {};
  const evidenceId = text(metadata.demo_evidence_id ?? row.id);
  const title = text(row.name);
  if (!evidenceId || !title) return null;
  const related = metadata.transactionIds;
  return {
    id: evidenceId,
    title,
    kind: text(row.evidence_type, "case_evidence"),
    description: text(row.description),
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
    sourceAgent: text(row.finding_type, "investigation") as AgentName,
    evidenceIds: list(row.evidence_ids).filter((id): id is string => typeof id === "string"),
    createdAt: text(row.created_at, new Date(0).toISOString()),
  };
}

function normalizeTask(row: Record<string, unknown>): AgentTask | null {
  const title = text(row.title ?? row.task);
  if (!title) return null;
  const agent = text(row.assigned_agent, "supervisor");
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
  const title = text(row.title);
  if (!title) return null;
  const approval = row.requires_approval === true
    ? "required"
    : "not_required";
  const status = text(row.status, approval === "required" ? "pending_approval" : "prepared");
  const category = text(row.action_type, "review");
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
  const status = text(row.verification_status, "needs_review");
  return {
    id: text(row.id, `verification-${status}`),
    check: "Persisted verification status",
    status: ["verified", "failed", "needs_review"].includes(status)
      ? (status as VerificationResult["status"])
      : "needs_review",
    expected: "",
    actual: "",
    details: "Only verification_status is stored by the existing database schema.",
    evidenceIds: [],
    createdAt: text(row.created_at, new Date(0).toISOString()),
  };
}

function normalizeEvent(row: Record<string, unknown>, caseId: string): CaseEvent | null {
  const eventType = text(row.event_type ?? row.type);
  if (!eventType) return null;
  const metadata = record(row.metadata) ?? {};
  return {
    id: text(
      row.demo_event_id ?? metadata.demo_event_id ?? row.event_id ?? row.id,
      `event-${crypto.randomUUID()}`,
    ),
    caseId,
    eventType,
    description: text(row.message),
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
  databaseCaseId: string,
  warnings: PersistenceWarning[],
): Promise<Record<string, unknown>[]> {
  try {
    const response = await db(client)
      .from(table)
      .select("*")
      .eq("case_id", databaseCaseId)
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

async function findCaseRow(
  client: CaseDatabaseClient,
  caseNumber: string,
  warnings: PersistenceWarning[],
): Promise<Record<string, unknown> | null> {
  try {
    const response = await db(client)
      .from("cases")
      .select("*")
      .eq("case_number", caseNumber)
      .limit(1);
    if (response.error) {
      warnings.push({ table: "cases", message: response.error.message });
      return null;
    }
    return response.data?.[0] ?? null;
  } catch (error) {
    warnings.push({
      table: "cases",
      message: error instanceof Error ? error.message : "Unknown Supabase case lookup error.",
    });
    return null;
  }
}

async function resolveDatabaseCaseId(
  client: CaseDatabaseClient,
  caseNumber: string,
  warnings: PersistenceWarning[],
): Promise<string | null> {
  const cachedCaseId = databaseCaseIds.get(caseNumber);
  if (cachedCaseId) return cachedCaseId;

  let caseRow = await findCaseRow(client, caseNumber, warnings);
  if (typeof caseRow?.id !== "string" && !warnings.some((warning) => warning.table === "cases")) {
    if (caseNumber === syntheticCase.caseId && process.env.CASEGUARD_DEMO_MODE === "true") {
      try {
        const response = await db(client)
          .from("cases")
          .insert({ case_number: caseNumber, status: "open" })
          .select("id,case_number,status")
          .single();
        if (response.error) {
          warnings.push({ table: "cases", message: response.error.message });
        } else {
          caseRow = response.data;
        }
      } catch (error) {
        warnings.push({
          table: "cases",
          message: error instanceof Error ? error.message : "Unknown Supabase case insert error.",
        });
      }
    }
  }

  if (typeof caseRow?.id === "string") {
    databaseCaseIds.set(caseNumber, caseRow.id);
    return caseRow.id;
  }

  if (
    caseNumber === syntheticCase.caseId &&
    !warnings.some((warning) => warning.table === "cases")
  ) {
    warnings.push({
      table: "cases",
      message: `No database UUID is available for case number ${caseNumber}; child records were not persisted.`,
    });
  }
  return null;
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
  const caseRow = await findCaseRow(client, caseId, warnings);
  const databaseCaseId = typeof caseRow?.id === "string"
    ? (databaseCaseIds.set(caseId, caseRow.id), caseRow.id)
    : await resolveDatabaseCaseId(client, caseId, warnings);
  const tables = await Promise.all(
    tableNames.map(async (table) => [
      table,
      databaseCaseId ? await readTable(client, table, databaseCaseId, warnings) : [],
    ] as const),
  );
  const rows = Object.fromEntries(tables) as Record<
    (typeof tableNames)[number],
    Record<string, unknown>[]
  >;
  const cached = caseId === syntheticCase.caseId ? caseCache.get(caseId) : undefined;

  if (caseId !== syntheticCase.caseId && !databaseCaseId && !cached) {
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
    .map((row) => normalizeEvent(row, caseId))
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
  const databaseCaseId = databaseCaseIds.get(run.case_id);
  if (!databaseCaseId) return [];

  const warnings: PersistenceWarning[] = [];
  const runWarning = await insertRecord(client, "agent_runs", {
    case_id: databaseCaseId,
    agent_name: run.agent_name,
    task: run.task,
    input: run.input,
    output: run.output,
    status: run.status,
    started_at: run.started_at,
    completed_at: run.completed_at,
    error_message: run.error,
  });
  if (runWarning) warnings.push(runWarning);

  const createdAt = new Date().toISOString();
  const taskRows = [
    {
      case_id: databaseCaseId,
      title: assignedTask.title,
      assigned_agent: assignedTask.agent,
      status: "completed",
      description: assignedTask.description,
      created_at: assignedTask.createdAt,
      completed_at: assignedTask.completedAt ?? run.completed_at,
    },
    ...result.tasks.map((item) => ({
      case_id: databaseCaseId,
      title: item.title,
      assigned_agent: item.agent,
      status: item.status,
      description: item.description,
      created_at: item.createdAt || createdAt,
      completed_at: item.completedAt ?? null,
    })),
  ];
  const writes: Array<[string, Record<string, unknown>]> = [
    ...taskRows.map((item) => ["tasks", item] as [string, Record<string, unknown>]),
    ...result.findings.map((item) => [
      "findings",
      {
        case_id: databaseCaseId,
        title: item.title,
        description: item.description,
        severity: item.severity,
        confidence: item.confidence,
        finding_type: item.sourceAgent,
        evidence_ids: item.evidenceIds,
        created_at: item.createdAt,
      },
    ] as [string, Record<string, unknown>]),
    ...result.actions.map((item) => [
      "actions",
      {
        case_id: databaseCaseId,
        title: item.title,
        description: item.description,
        action_type: item.category,
        requires_approval: item.approval === "required",
        status: item.status,
        created_at: item.createdAt,
      },
    ] as [string, Record<string, unknown>]),
    ...((result.data?.verifications as VerificationResult[] | undefined) ?? []).map((item) => [
      "verification_results",
      {
        case_id: databaseCaseId,
        verification_status: item.status,
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
        case_id: databaseCaseId,
        name: "Verified Evidence Package",
        evidence_type: "verified_evidence_package",
        source: "synthetic_demo",
        description: `E01 Bank Statement cross-checked against ${transactionIds.length} disputed transactions totaling INR ${numeric(evidencePackage.disputedAmount, 0).toLocaleString("en-IN")}. Prepared for human review; not submitted externally.`,
        verified: true,
        metadata: { demo_evidence_id: packageId, transactionIds },
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
  const databaseCaseId = databaseCaseIds.get(event.caseId);
  if (!databaseCaseId) return [];

  const warning = await insertRecord(client, "case_events", {
    case_id: databaseCaseId,
    event_type: event.eventType,
    message: event.description,
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
