import { apiErrorResponse, parseCaseId, requireApiClient } from "@/lib/api/http";
import { loadCaseState } from "@/lib/case/store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ caseId: string }> },
) {
  try {
    const client = await requireApiClient();
    const { caseId: rawCaseId } = await context.params;
    const caseId = parseCaseId(rawCaseId);
    const { state, warnings } = await loadCaseState(client, caseId);
    return Response.json({ case: state, persistenceWarnings: warnings });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
