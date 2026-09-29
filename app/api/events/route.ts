import { apiErrorResponse, ApiError, parseCaseId, readJson, requireApiClient } from "@/lib/api/http";
import { loadCaseState } from "@/lib/case/store";
import { presentCaseState } from "@/lib/case/response";
import { CASE_ID } from "@/lib/case/synthetic";
import { replanCase, recordCaseEvent } from "@/lib/orchestration/engine";
import type { CaseEvent } from "@/lib/types/agents";

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const caseId = parseCaseId(body.caseId ?? CASE_ID);
    const client = await requireApiClient(caseId);
    const eventType = body.eventType ?? body.type;
    const description = body.description ?? body.message;
    if (
      !["bank_response", "BANK_RESPONSE_RECEIVED"].includes(String(eventType)) ||
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
      eventType: "BANK_RESPONSE_RECEIVED",
      description: description.trim(),
      metadata: {
        source: "synthetic_demo",
        externalConnectionUsed: false,
        agentName: "system",
        status: "received",
        message: description.trim(),
        timestamp: new Date().toISOString(),
      },
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
    const caseView = presentCaseState(outcome.state);

    return Response.json(
      {
        event,
        ...outcome,
        ...caseView,
        state: caseView,
        case: caseView,
        persistenceWarnings,
        completed: outcome.agentErrors.length === 0,
      },
      { status: outcome.agentErrors.length > 0 ? 502 : 200 },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
