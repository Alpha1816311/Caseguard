import { apiErrorResponse, parseCaseId, readJson, requireApiClient } from "@/lib/api/http";
import { CASE_ID } from "@/lib/case/synthetic";
import { investigateCase } from "@/lib/orchestration/engine";

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const caseId = parseCaseId(body.caseId ?? CASE_ID);
    const client = await requireApiClient(caseId);
    const outcome = await investigateCase(client, caseId);
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
