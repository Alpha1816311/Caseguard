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
    <main className="flex min-h-screen items-center justify-center bg-[#09090b] px-6 text-white">
      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#111114] p-8 shadow-2xl shadow-black/30">
        <div className="border-b border-white/[0.07] pb-5">
          <p className="text-lg font-bold tracking-tight">CASEGUARD</p>

          <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">
            Autonomous Financial Crime Investigation
          </p>
        </div>

        <div className="mt-8">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400">
              Investigation Live
            </p>
          </div>

          <h1 className="mt-3 text-2xl font-semibold tracking-tight">
            Investigation in progress
          </h1>

          <p className="mt-2 text-sm leading-6 text-zinc-500">
            CASEGUARD is analyzing the submitted incident and coordinating
            the investigation agents.
          </p>
        </div>

        <div className="mt-8 space-y-4">
          {steps.map((step, index) => {
            const completed = index < currentStep;
            const active = index === currentStep;

            return (
              <div
                key={step}
                className="flex items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                    completed
                      ? "bg-white text-black"
                      : active
                        ? "border border-white/30 bg-white/[0.06] text-white"
                        : "border border-white/10 text-zinc-600"
                  }`}
                >
                  {completed ? "✓" : index + 1}
                </div>

                <span
                  className={`text-sm ${
                    active || completed
                      ? "font-medium text-zinc-200"
                      : "text-zinc-600"
                  }`}
                >
                  {step}
                </span>

                {active && (
                  <div className="ml-auto h-4 w-4 animate-spin rounded-full border-2 border-white/10 border-t-white" />
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-7 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full bg-white transition-all duration-700"
            style={{
              width: `${Math.min(
                ((currentStep + 1) / steps.length) * 100,
                100,
              )}%`,
            }}
          />
        </div>

        <div className="mt-5 flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-600">
          <span>CASEGUARD ORCHESTRATOR</span>
          <span>{Math.min(currentStep + 1, steps.length)}/5</span>
        </div>
      </div>
    </main>
  );
}