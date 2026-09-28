import { apiErrorResponse, ApiError, parseCaseId, readJson, requireApiClient } from "@/lib/api/http";
import { loadCaseState } from "@/lib/case/store";
import { CASE_ID } from "@/lib/case/synthetic";
import { replanCase, recordCaseEvent } from "@/lib/orchestration/engine";
import type { CaseEvent } from "@/lib/types/agents";

export async function POST(request: Request) {
  try {
    const client = await requireApiClient();
    const body = await readJson(request);
    const caseId = parseCaseId(body.caseId ?? CASE_ID);
    const eventType = body.eventType ?? body.type;
    const description = body.description ?? body.message;
    if (
      eventType !== "bank_response" ||
      typeof description !== "string" ||
      !/additional evidence required/i.test(description.trim()) ||
      description.trim().length > 500
    ) {
      throw new ApiError(
        'Only the bank_response event "Additional evidence required." is supported.',
        400,
      );
    }

    const { state } = await loadCaseState(client, caseId);
    const event: CaseEvent = {
      id: crypto.randomUUID(),
      caseId,
      eventType: "bank_response",
      description: description.trim(),
      metadata: { source: "synthetic_demo", externalConnectionUsed: false },
      createdAt: new Date().toISOString(),
    };
    const eventWarnings = await recordCaseEvent(client, state, event);
    const outcome = await replanCase(client, caseId);
    const persistenceWarnings = [
      ...new Map(
        [...eventWarnings, ...outcome.persistenceWarnings].map((warning) => [
          `${warning.table}:${warning.message}`,
          warning,
        ]),
      ).values(),
    ];

    return Response.json(
      {
        event,
        ...outcome,
        persistenceWarnings,
        completed: outcome.agentErrors.length === 0,
      },
      { status: outcome.agentErrors.length > 0 ? 502 : 200 },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
