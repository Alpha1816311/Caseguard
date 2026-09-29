export type AgentName =
  | "supervisor"
  | "triage"
  | "transaction_forensics"
  | "evidence"
  | "investigation"
  | "risk"
  | "compliance"
  | "action_planner"
  | "follow_up"
  | "recovery"
  | "verification"
  | "replanner";

export type AgentStatus = "completed" | "needs_review" | "skipped" | "failed";
export type TaskStatus = "pending" | "in_progress" | "completed" | "blocked";
export type ActionApproval = "required" | "not_required";

export interface InvestigationFinding {
  id: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  sourceAgent: AgentName;
  evidenceIds: string[];
  createdAt: string;
}

export interface AgentTask {
  id: string;
  agent: AgentName;
  title: string;
  description: string;
  status: TaskStatus;
  createdAt: string;
  completedAt?: string;
}

export interface RecommendedAction {
  id: string;
  title: string;
  description: string;
  category: "evidence" | "review" | "customer" | "financial" | "legal";
  approval: ActionApproval;
  status: "prepared" | "pending_approval" | "approved" | "rejected";
  evidenceIds: string[];
  createdAt: string;
}

export interface VerificationResult {
  id: string;
  check: string;
  status: "verified" | "failed" | "needs_review";
  expected: string;
  actual: string;
  details: string;
  evidenceIds: string[];
  createdAt: string;
}

export interface CaseEvent {
  id: string;
  caseId: string;
  eventType: string;
  description: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AgentResult {
  agent: AgentName;
  status: AgentStatus;
  summary: string;
  findings: InvestigationFinding[];
  evidenceIds: string[];
  tasks: AgentTask[];
  actions: RecommendedAction[];
  confidence: number;
  nextAgents: AgentName[];
  data?: Record<string, unknown>;
}

export interface CaseTransaction {
  id: string;
  time: string;
  amount: number;
  currency: "INR";
  channel: string;
  account: string;
  disputed: boolean;
  classification?: string;
}

export interface CaseEvidence {
  id: string;
  title: string;
  kind: string;
  description: string;
  transactionIds: string[];
  verified: boolean;
}

export interface CaseState {
  caseId: string;
  account: string;
  status: string;
  disputedAmount: number;
  disputedTransactionCount: number;
  transactions: CaseTransaction[];
  evidence: CaseEvidence[];
  findings: InvestigationFinding[];
  tasks: AgentTask[];
  actions: RecommendedAction[];
  verifications: VerificationResult[];
  events: CaseEvent[];
  agentResults: AgentResult[];
  revision: number;
  updatedAt: string;
}

export interface AgentRunRecord {
  case_id: string;
  agent_name: AgentName;
  task: string;
  input: Record<string, unknown>;
  output: AgentResult;
  status: AgentStatus;
  started_at: string;
  completed_at: string;
  error: string | null;
}

export interface PersistenceWarning {
  table: string;
  message: string;
}
