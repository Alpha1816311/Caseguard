export interface IntakePayload {
  incidentType: string;
  date: string;
  time: string;
  bank: string;
  account: string;
  amount: number;
  transactionIds: string[];
  description: string;
  evidence: string[];
}

export function parseIntakePayload(raw: Record<string, unknown>): IntakePayload {
  const transactionIds = String(raw.transactionIds ?? "")
    .split(/[\n,]+/)
    .map((value) => value.trim())
    .filter(Boolean);

  const evidence = String(raw.evidence ?? "")
    .split(/[\n,]+/)
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    incidentType: String(raw.incidentType ?? "Other"),
    date: String(raw.date ?? ""),
    time: String(raw.time ?? ""),
    bank: String(raw.bank ?? ""),
    account: String(raw.account ?? ""),
    amount: Number(raw.amount ?? 0),
    transactionIds,
    description: String(raw.description ?? ""),
    evidence,
  };
}