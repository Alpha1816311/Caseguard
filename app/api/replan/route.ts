import { apiErrorResponse, ApiError, parseCaseId, readJson, requireApiClient } from "@/lib/api/http";
import { loadCaseState } from "@/lib/case/store";
import { CASE_ID } from "@/lib/case/synthetic";
import { hasPendingReplan, replanCase } from "@/lib/orchestration/engine";

export async function POST(request: Request) {
  try {
    const client = await requireApiClient();
    const body = await readJson(request);
    const caseId = parseCaseId(body.caseId ?? CASE_ID);
    const { state } = await loadCaseState(client, caseId);
    if (!hasPendingReplan(state)) {
      throw new ApiError("There is no unprocessed bank-response event to replan.", 409);
    }
    const outcome = await replanCase(client, caseId);
    return Response.json(
      {
        ...outcome,
        completed: outcome.agentErrors.length === 0,
      },
      { status: outcome.agentErrors.length > 0 ? 502 : 200 },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
