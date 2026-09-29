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
      const response = await fetch("/api/cases/create", {
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
        error?: string;
        message?: string;
      } = {};

      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(`Server returned an invalid response (${response.status}).`);
        }
      }

      if (!response.ok) {
        throw new Error(
          data.error ||
            data.message ||
            `Unable to create case (${response.status}).`,
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
    <main className="min-h-screen bg-[#f7f8fa] px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <p className="text-sm font-semibold tracking-wide text-[#6b7280]">
            CASEGUARD
          </p>

          <h1 className="mt-2 text-3xl font-bold text-[#111827]">
            Report a Financial Crime
          </h1>

          <p className="mt-2 text-sm leading-6 text-[#6b7280]">
            Submit the incident details below. CASEGUARD will create the case
            and begin the investigation.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-sm"
        >
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium">
                Incident type
              </label>
              <select
                value={form.incidentType}
                onChange={(e) =>
                  updateField("incidentType", e.target.value)
                }
                className="w-full rounded-lg border border-[#d1d5db] px-3 py-2.5 text-sm"
              >
                <option>Unauthorized Transaction</option>
                <option>UPI Fraud</option>
                <option>Card Fraud</option>
                <option>Account Takeover</option>
                <option>Other</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                Bank / Provider
              </label>
              <input
                value={form.bank}
                onChange={(e) => updateField("bank", e.target.value)}
                placeholder="e.g. GPay, HDFC, SBI"
                className="w-full rounded-lg border border-[#d1d5db] px-3 py-2.5 text-sm"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                Date
              </label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => updateField("date", e.target.value)}
                className="w-full rounded-lg border border-[#d1d5db] px-3 py-2.5 text-sm"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                Approximate time
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={form.time}
                onChange={(e) => updateField("time", e.target.value)}
                placeholder="e.g. 03:00 PM"
                className="w-full rounded-lg border border-[#d1d5db] px-3 py-2.5 text-sm"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                Account / Card
              </label>
              <input
                value={form.account}
                onChange={(e) => updateField("account", e.target.value)}
                placeholder="e.g. XXXX4533"
                className="w-full rounded-lg border border-[#d1d5db] px-3 py-2.5 text-sm"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                Amount (₹)
              </label>
              <input
                type="number"
                min="1"
                value={form.amount}
                onChange={(e) => updateField("amount", e.target.value)}
                placeholder="45000"
                className="w-full rounded-lg border border-[#d1d5db] px-3 py-2.5 text-sm"
                required
              />
            </div>
          </div>

          <div className="mt-5">
            <label className="mb-2 block text-sm font-medium">
              Transaction ID(s)
            </label>
            <textarea
              value={form.transactionIds}
              onChange={(e) =>
                updateField("transactionIds", e.target.value)
              }
              placeholder="e.g. TXNED345"
              rows={2}
              className="w-full rounded-lg border border-[#d1d5db] px-3 py-2.5 text-sm"
            />
          </div>

          <div className="mt-5">
            <label className="mb-2 block text-sm font-medium">
              What happened?
            </label>
            <textarea
              value={form.description}
              onChange={(e) =>
                updateField("description", e.target.value)
              }
              placeholder="Describe the suspicious activity..."
              rows={4}
              className="w-full rounded-lg border border-[#d1d5db] px-3 py-2.5 text-sm"
            />
          </div>

          <div className="mt-5">
            <label className="mb-2 block text-sm font-medium">
              Available evidence
            </label>
            <textarea
              value={form.evidence}
              onChange={(e) =>
                updateField("evidence", e.target.value)
              }
              placeholder="e.g. SMS screenshot, bank statement"
              rows={3}
              className="w-full rounded-lg border border-[#d1d5db] px-3 py-2.5 text-sm"
            />
          </div>

          {error && (
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-6 w-full rounded-lg bg-[#111827] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1f2937] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Creating Investigation..." : "Start Investigation"}
          </button>
        </form>
      </div>
    </main>
  );
}