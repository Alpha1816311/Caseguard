"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type FormState = {
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

const initialForm: FormState = {
  incidentType: "Unauthorized Transaction",
  date: "",
  time: "",
  bank: "",
  account: "",
  amount: "",
  transactionIds: "",
  description: "",
  evidence: "",
};

const inputClass =
  "mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-white/25 focus:bg-white/[0.06]";

export default function ReportPage() {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!form.amount || Number(form.amount) <= 0) {
      setError("Please enter a valid transaction amount.");
      return;
    }

    if (!form.account.trim()) {
      setError("Please enter the account or card number.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/cases", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...form,
          amount: Number(form.amount),
        }),
      });

      const text = await response.text();

      let data: {
        caseId?: string;
        caseUuid?: string;
        error?: string;
      } = {};

      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(
            `Server returned an invalid response (${response.status}).`,
          );
        }
      }

      if (!response.ok) {
        throw new Error(
          data.error || `Unable to create case (${response.status}).`,
        );
      }

      if (!data.caseId) {
        throw new Error("No case ID was returned.");
      }

      sessionStorage.setItem(
        "caseguard-intake",
        JSON.stringify({
          ...form,
          amount: Number(form.amount),
          caseId: data.caseId,
          caseUuid: data.caseUuid,
        }),
      );

      router.push("/processing");
    } catch (err) {
      console.error("CASEGUARD create case error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to create the case.",
      );

      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#09090b] text-white">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#0c0c0f]">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-6">
          <div>
            <p className="text-lg font-bold tracking-tight">CASEGUARD</p>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">
              Financial Crime Investigation
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/")}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-zinc-300 transition hover:bg-white/[0.07] hover:text-white"
          >
            Back to Dashboard
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-[1100px] px-6 py-10">
        {/* Heading */}
        <div className="mb-8">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
            New Investigation
          </div>

          <h1 className="text-3xl font-semibold tracking-tight">
            Report a Financial Crime
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
            Submit the incident details below. CASEGUARD will create a case,
            analyze the available evidence, and begin the investigation.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
            {/* Form */}
            <section className="rounded-2xl border border-white/10 bg-[#111114] p-6 shadow-2xl shadow-black/20">
              <div className="mb-6 border-b border-white/[0.07] pb-5">
                <h2 className="text-sm font-semibold">
                  Incident Information
                </h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Provide the details you know about the suspicious activity.
                </p>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <label className="text-xs font-medium text-zinc-300">
                  Incident type
                  <select
                    value={form.incidentType}
                    onChange={(e) =>
                      updateField("incidentType", e.target.value)
                    }
                    className={inputClass}
                  >
                    <option className="bg-[#111114]">
                      Unauthorized Transaction
                    </option>
                    <option className="bg-[#111114]">UPI Fraud</option>
                    <option className="bg-[#111114]">Card Fraud</option>
                    <option className="bg-[#111114]">
                      Account Takeover
                    </option>
                    <option className="bg-[#111114]">Other</option>
                  </select>
                </label>

                <label className="text-xs font-medium text-zinc-300">
                  Bank / Provider
                  <input
                    value={form.bank}
                    onChange={(e) => updateField("bank", e.target.value)}
                    placeholder="e.g. GPay, HDFC, SBI"
                    className={inputClass}
                  />
                </label>

                <label className="text-xs font-medium text-zinc-300">
                  Incident date
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => updateField("date", e.target.value)}
                    className={inputClass}
                  />
                </label>

                <label className="text-xs font-medium text-zinc-300">
                  Approximate time
                  <input
                    type="text"
                    inputMode="numeric"
                    value={form.time}
                    onChange={(e) => updateField("time", e.target.value)}
                    placeholder="e.g. 03:00 PM"
                    className={inputClass}
                  />
                </label>

                <label className="text-xs font-medium text-zinc-300">
                  Account / Card
                  <input
                    value={form.account}
                    onChange={(e) => updateField("account", e.target.value)}
                    placeholder="e.g. XXXX4533"
                    className={inputClass}
                    required
                  />
                </label>

                <label className="text-xs font-medium text-zinc-300">
                  Disputed amount
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
                      ₹
                    </span>
                    <input
                      type="number"
                      min="1"
                      value={form.amount}
                      onChange={(e) => updateField("amount", e.target.value)}
                      placeholder="45000"
                      className={`${inputClass} pl-8`}
                      required
                    />
                  </div>
                </label>
              </div>

              <div className="mt-5">
                <label className="text-xs font-medium text-zinc-300">
                  Transaction ID(s)
                  <textarea
                    value={form.transactionIds}
                    onChange={(e) =>
                      updateField("transactionIds", e.target.value)
                    }
                    placeholder="Enter transaction reference numbers"
                    rows={2}
                    className={`${inputClass} resize-none`}
                  />
                </label>
              </div>

              <div className="mt-5">
                <label className="text-xs font-medium text-zinc-300">
                  What happened?
                  <textarea
                    value={form.description}
                    onChange={(e) =>
                      updateField("description", e.target.value)
                    }
                    placeholder="Briefly describe the suspicious activity..."
                    rows={4}
                    className={`${inputClass} resize-none`}
                  />
                </label>
              </div>

              <div className="mt-5">
                <label className="text-xs font-medium text-zinc-300">
                  Available evidence
                  <textarea
                    value={form.evidence}
                    onChange={(e) =>
                      updateField("evidence", e.target.value)
                    }
                    placeholder="e.g. SMS screenshot, bank statement, complaint acknowledgement"
                    rows={3}
                    className={`${inputClass} resize-none`}
                  />
                </label>
              </div>

              {error && (
                <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="mt-6 w-full rounded-xl bg-white px-5 py-3.5 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting
                  ? "Creating Investigation..."
                  : "Start Investigation"}
              </button>
            </section>

            {/* Right panel */}
            <aside className="space-y-5">
              <div className="rounded-2xl border border-white/10 bg-[#111114] p-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Investigation Flow
                </p>

                <div className="mt-5 space-y-5">
                  {[
                    ["01", "Create case", "Incident is securely recorded."],
                    ["02", "Analyze", "Transactions and evidence are analyzed."],
                    ["03", "Investigate", "Financial crime patterns are evaluated."],
                    ["04", "Verify", "Findings are checked before action."],
                  ].map(([number, title, description]) => (
                    <div key={number} className="flex gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-[9px] font-semibold text-zinc-400">
                        {number}
                      </div>

                      <div>
                        <p className="text-xs font-semibold text-zinc-200">
                          {title}
                        </p>
                        <p className="mt-1 text-[11px] leading-5 text-zinc-500">
                          {description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#111114] p-5">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    Human in the Loop
                  </p>
                </div>

                <p className="mt-3 text-sm font-medium text-zinc-200">
                  Consequential actions require approval.
                </p>

                <p className="mt-2 text-xs leading-5 text-zinc-500">
                  CASEGUARD prepares findings and recommended actions while
                  keeping human approval in the loop.
                </p>
              </div>
            </aside>
          </div>
        </form>
      </div>
    </main>
  );
}