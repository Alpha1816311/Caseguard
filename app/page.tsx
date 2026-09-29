"use client";

import { mockCase } from "../data/mock-case";
import { useEffect, useState } from "react";
import { createCaseEvent, getCase } from "../lib/case-api";
import { adaptCaseResponse } from "../lib/case-adapter";

import {
  AlertTriangle,
  Check,
  Clock3,
  FileCheck2,
  Search,
  ShieldAlert,
  Zap,
} from "lucide-react";

type IntakeData = {
  incidentType: string;
  date: string;
  time: string;
  bank: string;
  account: string;
  amount: string;
  transactionIds: string;
  description: string;
  evidence: string;
};

function buildPendingCase() {
  return {
    ...mockCase,
    caseId: "NEW CASE",
    risk: "PENDING",
    status: "NEW",
    agents: mockCase.agents.map((agent) => ({
      ...agent,
      status: "pending",
    })),
    timeline: [
      {
        time: new Date().toLocaleTimeString("en-GB"),
        agent: "SYSTEM",
        message: "Incident submitted — investigation pending",
      },
    ],
    findings: [],
    verification: [],
  };
}

export default function Home() {
  const [caseData, setCaseData] = useState(mockCase);
  const [intakeData, setIntakeData] = useState<IntakeData | null>(null);

  const [replanning, setReplanning] = useState(false);
  const [replanStep, setReplanStep] = useState(0);
  const [decision, setDecision] = useState<string | null>(null);
  const [showEvidence, setShowEvidence] = useState(false);

  useEffect(() => {
    /*
     * Temporary intake handoff.
     * Later this will be replaced by the real Supabase case ID.
     */
    const stored = sessionStorage.getItem("caseguard-intake");

    if (stored) {
      try {
        const parsed = JSON.parse(stored) as IntakeData;

        setIntakeData(parsed);

        // New incident = no fake investigation results.
        setCaseData(buildPendingCase());

        return;
      } catch {
        sessionStorage.removeItem("caseguard-intake");
      }
    }

    // Existing demo case fallback.
    getCase("CG-001")
      .then((data) => {
        setCaseData(adaptCaseResponse(data));
      })
      .catch(() => {
        setCaseData(mockCase);
      });
  }, []);

  const displayCaseId = intakeData ? "NEW CASE" : caseData.caseId;

  const displayAmount = intakeData
    ? `₹${Number(intakeData.amount || 0).toLocaleString("en-IN")}`
    : caseData.disputedAmount;

  const displayTransactionCount = intakeData
    ? intakeData.transactionIds
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean).length || 0
    : caseData.transactions;

  const displayEvidenceCount = intakeData
    ? intakeData.evidence.trim()
      ? intakeData.evidence
          .split(/[\n,]+/)
          .map((item) => item.trim())
          .filter(Boolean).length || 1
      : 0
    : caseData.evidence;

  const replanSteps = [
    "Existing evidence searched",
    "Bank statement found",
    "Transactions cross-checked",
    "Evidence package prepared",
  ];

  const startReplanning = async () => {
    setReplanning(true);
    setReplanStep(0);

    try {
      const caseId = intakeData ? null : "CG-001";

      if (caseId) {
        await createCaseEvent(
          caseId,
          "BANK_EVIDENCE_REQUEST",
          "Additional evidence required.",
        );
      }

      for (let i = 0; i < replanSteps.length; i++) {
        await new Promise((resolve) => setTimeout(resolve, 700));
        setReplanStep(i + 1);
      }

      if (caseId) {
        const latest = await getCase(caseId);
        setCaseData(adaptCaseResponse(latest));
      }

      setReplanning(false);
    } catch (error) {
      console.error("Replanning failed:", error);
      setReplanning(false);
    }
  };

  function resetReplanning() {
    setReplanning(false);
    setReplanStep(0);
  }

  return (
    <main className="min-h-screen bg-[#080b10] text-slate-100">
      {/* HEADER */}
      <header className="border-b border-slate-800 bg-[#0b0f15]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <h1 className="text-xl font-bold tracking-[0.18em] text-white">
              CASEGUARD
            </h1>

            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">
              Autonomous Financial Crime Investigation
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />

            <span className="text-xs font-medium text-emerald-400">
              INVESTIGATION LIVE
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        {/* NEW INTAKE SUMMARY */}
        {intakeData && (
          <section className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.03]">
            <div className="border-b border-cyan-500/10 px-5 py-4">
              <p className="text-xs uppercase tracking-widest text-cyan-400">
                Submitted Incident
              </p>

              <h2 className="mt-1 font-semibold">{intakeData.incidentType}</h2>
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-2">
              <Info label="Bank / Provider" value={intakeData.bank} />
              <Info
                label="Account / Card"
                value={intakeData.account || "Not provided"}
              />
              <Info
                label="Incident Date"
                value={`${intakeData.date || "Not provided"}${
                  intakeData.time ? ` · ${intakeData.time}` : ""
                }`}
              />
              <Info label="Reported Amount" value={displayAmount} />

              <div className="md:col-span-2">
                <p className="text-[10px] uppercase tracking-widest text-slate-500">
                  Incident Description
                </p>

                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {intakeData.description}
                </p>
              </div>

              {intakeData.transactionIds && (
                <div className="md:col-span-2">
                  <p className="text-[10px] uppercase tracking-widest text-slate-500">
                    Submitted Transactions
                  </p>

                  <p className="mt-2 whitespace-pre-wrap font-mono text-xs leading-6 text-cyan-300">
                    {intakeData.transactionIds}
                  </p>
                </div>
              )}

              {intakeData.evidence && (
                <div className="md:col-span-2">
                  <p className="text-[10px] uppercase tracking-widest text-slate-500">
                    Evidence Reported
                  </p>

                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    {intakeData.evidence}
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* CASE OVERVIEW */}
        <section className="rounded-xl border border-slate-800 bg-[#0d1219]">
          <div className="flex flex-col justify-between gap-4 border-b border-slate-800 px-5 py-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-500">
                Case
              </p>

              <h2 className="mt-1 text-lg font-semibold">#{displayCaseId}</h2>
            </div>

            <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2">
              <ShieldAlert className="h-4 w-4 text-red-400" />

              <span className="text-xs font-bold tracking-wider text-red-400">
                HIGH RISK
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 divide-x divide-slate-800 sm:grid-cols-5">
            <Stat label="Risk" value={caseData.risk} danger />
            <Stat label="Disputed" value={displayAmount} />
            <Stat label="Transactions" value={displayTransactionCount} />
            <Stat label="Evidence" value={displayEvidenceCount} />
            <Stat label="Status" value={intakeData ? "NEW" : caseData.status} />
          </div>
        </section>

        {/* AGENTS + TIMELINE */}
        <section className="grid gap-6 lg:grid-cols-[280px_1fr]">
          {/* AGENT STATUS */}
          <div className="rounded-xl border border-slate-800 bg-[#0d1219]">
            <div className="border-b border-slate-800 px-5 py-4">
              <p className="text-xs uppercase tracking-widest text-slate-500">
                System
              </p>

              <h2 className="mt-1 font-semibold">Agent Status</h2>
            </div>

            <div className="divide-y divide-slate-800/70">
              {caseData.agents.map((agent) => (
                <div
                  key={agent.name}
                  className="flex items-center justify-between px-5 py-3"
                >
                  <span className="text-sm text-slate-300">{agent.name}</span>

                  <AgentStatus status={agent.status} />
                </div>
              ))}
            </div>
          </div>

          {/* TIMELINE */}
          <div className="rounded-xl border border-slate-800 bg-[#0d1219]">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <div>
                <p className="text-xs uppercase tracking-widest text-slate-500">
                  Activity
                </p>

                <h2 className="mt-1 font-semibold">Live Agent Timeline</h2>
              </div>

              <Clock3 className="h-5 w-5 text-slate-500" />
            </div>

            <div className="space-y-1 p-5">
              {caseData.timeline.map((event) => (
                <div
                  key={event.time}
                  className="grid gap-1 rounded-lg px-3 py-3 hover:bg-slate-800/30 sm:grid-cols-[75px_100px_1fr] sm:gap-3"
                >
                  <span className="font-mono text-xs text-slate-500">
                    {event.time}
                  </span>

                  <span className="text-xs font-semibold text-cyan-400">
                    {event.agent}
                  </span>

                  <span className="text-sm text-slate-300">
                    → {event.message}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FINDINGS + VERIFICATION */}
        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-[#0d1219]">
            <div className="border-b border-slate-800 px-5 py-4">
              <p className="text-xs uppercase tracking-widest text-slate-500">
                Investigation Output
              </p>

              <h2 className="mt-1 font-semibold">Findings</h2>
            </div>

            <div className="space-y-3 p-5">
              {caseData.findings.length > 0 ? (
                caseData.findings.map((finding, index) => (
                  <div
                    key={`${finding}-${index}`}
                    className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-3"
                  >
                    <AlertTriangle className="h-4 w-4 text-amber-400" />

                    <span className="text-sm text-slate-300">{finding}</span>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                  <p className="text-sm text-slate-500">
                    No findings yet. Investigation has not started.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#0d1219]">
            <div className="border-b border-slate-800 px-5 py-4">
              <p className="text-xs uppercase tracking-widest text-slate-500">
                Evidence Validation
              </p>

              <h2 className="mt-1 font-semibold">Verification</h2>
            </div>

            <div className="space-y-3 p-5">
              {caseData.verification.length > 0 ? (
                caseData.verification.map((item) => (
                  <div
                    key={item}
                    className="flex items-center justify-between rounded-lg border border-emerald-500/10 bg-emerald-500/5 p-3"
                  >
                    <span className="text-sm text-slate-300">{item}</span>

                    <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                      <Check className="h-4 w-4" />
                      VERIFIED
                    </span>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                  <p className="text-sm text-slate-500">
                    Verification will appear after the investigation runs.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* HUMAN APPROVAL */}
        <section className="rounded-xl border border-amber-500/20 bg-amber-500/[0.03]">
          <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <FileCheck2 className="h-5 w-5 text-amber-400" />

                <h2 className="font-semibold text-amber-300">
                  Action Requires Human Approval
                </h2>
              </div>

              {decision ? (
                <p className="mt-2 text-sm text-slate-400">
                  Decision recorded:{" "}
                  <span className="font-semibold text-white">{decision}</span>
                </p>
              ) : (
                <p className="mt-2 text-sm text-slate-500">
                  {intakeData
                    ? "Investigation has not completed yet. Human approval will appear after verification."
                    : "AI investigation is complete. A human must authorize the consequential action."}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800"
                onClick={() => setShowEvidence(true)}
              >
                Review Evidence Package
              </button>

              <button
                disabled={Boolean(decision)}
                className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => setDecision("APPROVED")}
              >
                Approve
              </button>

              <button
                disabled={Boolean(decision)}
                className="rounded-lg border border-red-500/40 px-4 py-2.5 text-sm font-semibold text-red-400 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => setDecision("REJECTED")}
              >
                Reject
              </button>
            </div>
          </div>
        </section>

        {/* REPLANNING */}
        <section
          className={`overflow-hidden rounded-xl border transition-all duration-500 ${
            replanning
              ? "border-cyan-400/50 bg-cyan-400/[0.04] shadow-[0_0_35px_rgba(34,211,238,0.08)]"
              : "border-slate-800 bg-[#0d1219]"
          }`}
        >
          <div className="border-b border-slate-800 px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap
                  className={`h-5 w-5 ${
                    replanning ? "text-cyan-300" : "text-amber-400"
                  }`}
                />

                <h2 className="font-semibold">Replanning Event</h2>
              </div>

              <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                New Event
              </span>
            </div>
          </div>

          <div className="grid gap-6 p-5 lg:grid-cols-[1fr_1.5fr]">
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-500">
                Bank Response
              </p>

              <p className="mt-2 text-xl font-semibold text-white">
                Additional evidence required.
              </p>

              <p className="mt-3 text-sm text-slate-500">
                Supervisor detected case-state change.
              </p>

              <button
                onClick={startReplanning}
                disabled={replanning || Boolean(intakeData)}
                className="mt-5 flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-wait disabled:opacity-60"
              >
                <Zap className="h-4 w-4" />

                {intakeData
                  ? "AWAITING INVESTIGATION"
                  : replanning
                    ? "REPLANNING..."
                    : "INJECT BANK RESPONSE"}
              </button>
            </div>

            <div className="rounded-lg border border-slate-800 bg-black/20 p-4">
              <p className="mb-4 font-mono text-xs font-bold uppercase tracking-widest text-cyan-400">
                {replanning
                  ? "REPLANNING..."
                  : replanStep === replanSteps.length
                    ? "REPLANNING COMPLETE"
                    : "WAITING FOR EVENT"}
              </p>

              <div className="space-y-3">
                {replanSteps.map((step, index) => (
                  <ReplanStep
                    key={`${step}-${index}`}
                    text={step}
                    active={replanStep > index}
                  />
                ))}
              </div>

              {replanStep === replanSteps.length && (
                <div className="mt-5 flex flex-col gap-3 border-t border-slate-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-sm font-bold text-cyan-300">
                    <Search className="h-4 w-4" />
                    HUMAN REVIEW REQUIRED
                  </div>

                  <button
                    type="button"
                    onClick={resetReplanning}
                    className="text-left text-xs font-semibold text-slate-500 transition hover:text-slate-300 sm:text-right"
                  >
                    Replay demo sequence
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {showEvidence && (
        <EvidenceModal
          onClose={() => setShowEvidence(false)}
          intakeData={intakeData}
          amount={displayAmount}
          transactionCount={displayTransactionCount}
        />
      )}
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-slate-500">
        {label}
      </p>

      <p className="mt-1 text-sm font-medium text-slate-200">
        {value || "Not provided"}
      </p>
    </div>
  );
}

function EvidenceModal({
  onClose,
  intakeData,
  amount,
  transactionCount,
}: {
  onClose: () => void;
  intakeData: IntakeData | null;
  amount: string | number;
  transactionCount: string | number;
}) {
  const evidenceItems = intakeData?.evidence
    ? intakeData.evidence
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="evidence-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-700 bg-[#0d1219] shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-cyan-400">
              Evidence Package · {intakeData ? "NEW CASE" : "CG-001"}
            </p>

            <h2
              id="evidence-title"
              className="mt-1 text-lg font-semibold text-white"
            >
              Review before action
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-slate-500 transition hover:bg-slate-800 hover:text-white"
            aria-label="Close evidence package"
          >
            ×
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-amber-400">
              Investigation summary
            </p>

            <p className="mt-2 text-sm leading-6 text-slate-300">
              {amount} disputed across {transactionCount} transaction(s).
              {intakeData?.description
                ? ` ${intakeData.description}`
                : " The evidence chain has been reconstructed and transaction details have been verified."}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {evidenceItems.length > 0 ? (
              evidenceItems.map((item, index) => (
                <div
                  key={`${item}-${index}`}
                  className="rounded-lg border border-slate-800 bg-slate-900/50 p-3"
                >
                  <FileCheck2 className="h-4 w-4 text-emerald-400" />

                  <p className="mt-2 text-xs font-medium text-slate-300">
                    {item}
                  </p>

                  <p className="mt-1 text-[10px] uppercase tracking-wider text-emerald-400">
                    Reported
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                <FileCheck2 className="h-4 w-4 text-emerald-400" />

                <p className="mt-2 text-xs font-medium text-slate-300">
                  No evidence details submitted
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-800 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Close Review
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string | number;
  danger?: boolean;
}) {
  return (
    <div className="border-t border-slate-800 px-5 py-4 sm:border-t-0">
      <p className="text-[10px] uppercase tracking-widest text-slate-500">
        {label}
      </p>

      <p
        className={`mt-1 text-sm font-semibold ${
          danger ? "text-red-400" : "text-slate-200"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function AgentStatus({ status }: { status: string }) {
  if (status === "complete") {
    return (
      <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
        <Check className="h-4 w-4" />
        Complete
      </span>
    );
  }

  if (status === "working") {
    return (
      <span className="flex items-center gap-1.5 text-xs font-semibold text-cyan-400">
        <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
        Working
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5 text-xs text-slate-600">
      <span className="h-2 w-2 rounded-full border border-slate-600" />
      Pending
    </span>
  );
}

function ReplanStep({ text, active }: { text: string; active: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 text-sm transition-all duration-500 ${
        active ? "text-slate-200" : "text-slate-700"
      }`}
    >
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full ${
          active
            ? "bg-emerald-500/15 text-emerald-400"
            : "border border-slate-700"
        }`}
      >
        {active && <Check className="h-3 w-3" />}
      </span>

      {text}
    </div>
  );
}
