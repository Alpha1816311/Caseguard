import { apiErrorResponse, parseCaseId, requireApiClient } from "@/lib/api/http";
import { loadCaseState } from "@/lib/case/store";
import { presentCaseState } from "@/lib/case/response";

export async function GET(
  _request: Request,
  context: { params: Promise<{ caseId: string }> },
) {
  try {
    const { caseId: rawCaseId } = await context.params;
    const caseId = parseCaseId(rawCaseId);
    const client = await requireApiClient(caseId);
    const { state, warnings } = await loadCaseState(client, caseId);
    const caseView = presentCaseState(state);
    return Response.json({ ...caseView, case: caseView, persistenceWarnings: warnings });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
