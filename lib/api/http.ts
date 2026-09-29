import { CaseDatabaseError, CaseNotFoundError } from "@/lib/case/store";
import { CASE_ID } from "@/lib/case/synthetic";
import { createClient } from "@/lib/supabase/server";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function requireApiClient(caseId?: string) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    throw new ApiError("Supabase server configuration is missing.", 503);
  }

  let client: Awaited<ReturnType<typeof createClient>>;
  try {
    client = await createClient();
  } catch {
    throw new ApiError("Supabase server client could not be initialized.", 503);
  }

  const isDemoCase =
    process.env.CASEGUARD_DEMO_MODE === "true" && caseId === CASE_ID;
  if (!isDemoCase) {
    try {
      const { data, error } = await client.auth.getClaims();
      if (error || typeof data?.claims?.sub !== "string") {
        throw new ApiError("Authentication is required for this API.", 401);
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError("Supabase authentication could not be verified.", 503);
    }
  }

  return client;
}

export function parseCaseId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^CG-[A-Za-z0-9-]{1,32}$/.test(value.trim())
  ) {
    throw new ApiError("A valid caseId is required.", 400);
  }
  return value.trim();
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await request.json();
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new ApiError("Request body must be a JSON object.", 400);
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("Request body must contain valid JSON.", 400);
  }
}

export function apiErrorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof CaseNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof CaseDatabaseError) {
    return Response.json({ error: error.message }, { status: 503 });
  }
  return Response.json(
    { error: error instanceof Error ? error.message : "Unexpected server error." },
    { status: 500 },
  );
}
