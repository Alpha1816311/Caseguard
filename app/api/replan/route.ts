import { apiErrorResponse, ApiError, parseCaseId, readJson, requireApiClient } from "@/lib/api/http";
import { loadCaseState } from "@/lib/case/store";
import { CASE_ID } from "@/lib/case/synthetic";
import { presentCaseState } from "@/lib/case/response";
import { hasPendingReplan, replanCase } from "@/lib/orchestration/engine";

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const caseId = parseCaseId(body.caseId ?? CASE_ID);
    const client = await requireApiClient(caseId);
    const { state } = await loadCaseState(client, caseId);
    if (!hasPendingReplan(state)) {
      throw new ApiError("There is no unprocessed bank-response event to replan.", 409);
    }
    const outcome = await replanCase(client, caseId);
    const caseView = presentCaseState(outcome.state);
    return Response.json(
      {
        ...outcome,
        ...caseView,
        state: caseView,
        case: caseView,
        completed: outcome.agentErrors.length === 0,
      },
      { status: outcome.agentErrors.length > 0 ? 502 : 200 },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
