"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const steps = [
  "Receiving incident details",
  "Analyzing transaction information",
  "Checking available evidence",
  "Running financial crime investigation",
  "Preparing investigation results",
];

export default function ProcessingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function runInvestigation() {
      let intake: Record<string, unknown> = {};

      try {
        intake = JSON.parse(
          sessionStorage.getItem("caseguard-intake") ?? "{}",
        );
      } catch {
        router.push("/report");
        return;
      }

      const caseId = String(intake.caseId ?? "");

      if (!caseId) {
        router.push("/report");
        return;
      }

      for (let step = 0; step < 3; step++) {
        await new Promise((resolve) => setTimeout(resolve, 600));

        if (cancelled) return;

        setCurrentStep(step + 1);
      }

      try {
        const response = await fetch("/api/investigate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ caseId }),
        });

        if (!response.ok) {
          console.error(
            "Investigation API failed:",
            await response.text(),
          );
        }
      } catch (error) {
        console.error("Investigation request failed:", error);
      }

      if (cancelled) return;

      setCurrentStep(4);

      await new Promise((resolve) => setTimeout(resolve, 700));

      if (!cancelled) {
        router.push(`/?case=${encodeURIComponent(caseId)}`);
      }
    }

    runInvestigation();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f8fa] px-6">
      <div className="w-full max-w-xl rounded-2xl border border-[#e5e7eb] bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold tracking-wide text-[#6b7280]">
          CASEGUARD
        </p>

        <h1 className="mt-3 text-2xl font-bold">
          Investigation in progress
        </h1>

        <p className="mt-2 text-sm leading-6 text-[#6b7280]">
          CASEGUARD is processing the information you submitted and preparing
          your investigation.
        </p>

        <div className="mt-8 space-y-4">
          {steps.map((step, index) => {
            const completed = index < currentStep;
            const active = index === currentStep;

            return (
              <div key={step} className="flex items-center gap-4">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    completed
                      ? "bg-[#111827] text-white"
                      : active
                        ? "border-2 border-[#111827] text-[#111827]"
                        : "border border-[#d1d5db] text-[#9ca3af]"
                  }`}
                >
                  {completed ? "✓" : index + 1}
                </div>

                <span
                  className={`text-sm ${
                    active || completed
                      ? "font-medium text-[#111827]"
                      : "text-[#9ca3af]"
                  }`}
                >
                  {step}
                </span>

                {active && (
                  <div className="ml-auto h-4 w-4 animate-spin rounded-full border-2 border-[#d1d5db] border-t-[#111827]" />
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-8 h-2 overflow-hidden rounded-full bg-[#e5e7eb]">
          <div
            className="h-full bg-[#111827] transition-all duration-700"
            style={{
              width: `${Math.min(
                ((currentStep + 1) / steps.length) * 100,
                100,
              )}%`,
            }}
          />
        </div>

        <p className="mt-3 text-xs text-[#9ca3af]">
          Please keep this page open while CASEGUARD processes the case.
        </p>
      </div>
    </main>
  );
}