import Groq from "groq-sdk";
import type { AgentName } from "@/lib/types/agents";

export interface AgentNarrative {
  summary: string;
  confidence: number;
  nextAgents: AgentName[];
}

const allowedAgents: AgentName[] = [
  "supervisor",
  "triage",
  "transaction_forensics",
  "evidence",
  "investigation",
  "risk",
  "compliance",
  "action_planner",
  "verification",
  "replanner",
];

function parseNarrative(content: string): AgentNarrative {
  const value: unknown = JSON.parse(content);
  if (typeof value !== "object" || value === null) {
    throw new Error("Groq returned a non-object response.");
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.summary !== "string" ||
    record.summary.trim().length === 0 ||
    typeof record.confidence !== "number" ||
    !Number.isFinite(record.confidence) ||
    record.confidence < 0 ||
    record.confidence > 1 ||
    !Array.isArray(record.nextAgents) ||
    !record.nextAgents.every(
      (agent): agent is AgentName =>
        typeof agent === "string" && allowedAgents.includes(agent as AgentName),
    )
  ) {
    throw new Error("Groq returned invalid structured agent fields.");
  }

  return {
    summary: record.summary.trim().slice(0, 1200),
    confidence: record.confidence,
    nextAgents: record.nextAgents,
  };
}

export async function generateAgentNarrative(input: {
  agent: AgentName;
  task: string;
  caseContext: Record<string, unknown>;
  fallbackNextAgents: AgentName[];
}): Promise<{ narrative: AgentNarrative | null; warning: string | null }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return {
      narrative: null,
      warning: "GROQ_API_KEY is not configured; deterministic analysis was used.",
    };
  }

  try {
    const client = new Groq({ apiKey, timeout: 3_000, maxRetries: 0 });
    const completion = await client.chat.completions.create({
      model: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
      temperature: 0,
      max_tokens: 300,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a cautious financial-crime investigation assistant. Use only supplied facts. Do not accuse anyone, initiate financial actions, or invent evidence. Return JSON with summary (string), confidence (number from 0 to 1), and nextAgents (array of supplied agent names).",
        },
        {
          role: "user",
          content: JSON.stringify({
            agent: input.agent,
            task: input.task,
            caseContext: input.caseContext,
            allowedNextAgents: input.fallbackNextAgents,
          }),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("Groq returned an empty response.");
    }

    const narrative = parseNarrative(content);
    return {
      narrative: {
        ...narrative,
        nextAgents: narrative.nextAgents.filter((agent) =>
          input.fallbackNextAgents.includes(agent),
        ),
      },
      warning: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Groq error.";
    return {
      narrative: null,
      warning: `Groq analysis unavailable (${message.slice(0, 240)}); deterministic analysis was used.`,
    };
  }
}
