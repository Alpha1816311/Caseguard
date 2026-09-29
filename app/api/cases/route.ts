import { NextResponse } from "next/server";
import { requireApiClient, apiErrorResponse, readJson } from "@/lib/api/http";
import { parseIntakePayload } from "@/lib/case/intake";
function parseIncidentDateTime(date: string, time: string) {
  if (!date) {
    return new Date().toISOString();
  }

  const match = time.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);

  if (!match) {
    return new Date(`${date}T00:00:00`).toISOString();
  }

  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? "0");
  const meridiem = match[3]?.toUpperCase();

  if (meridiem === "PM" && hours < 12) {
    hours += 12;
  }

  if (meridiem === "AM" && hours === 12) {
    hours = 0;
  }

  const iso = `${date}T${String(hours).padStart(2, "0")}:${String(
    minutes,
  ).padStart(2, "0")}:00`;

  const parsed = new Date(iso);

  return Number.isNaN(parsed.getTime())
    ? new Date().toISOString()
    : parsed.toISOString();
}

export async function POST(request: Request) {
  try {
    const client = await requireApiClient();
    const body = await readJson(request);
    const intake = parseIntakePayload(body);

    if (!intake.amount || intake.amount <= 0) {
      return NextResponse.json(
        { error: "A valid transaction amount is required." },
        { status: 400 },
      );
    }

    const caseNumber = `CG-${Date.now().toString().slice(-8)}`;

    const {
      data: { user },
    } = await client.auth.getUser();

    const { data: caseRow, error: caseError } = await client
      .from("cases")
      .insert({
        user_id: user?.id ?? null,
        case_number: caseNumber,
        title: intake.incidentType || "Financial Crime Incident",
        description: intake.description || null,
        status: "open",
        risk_level: "high",
        current_stage: "triage",
        total_disputed_amount: intake.amount,
      })
      .select("id, case_number")
      .single();

    if (caseError || !caseRow) {
      console.error("CASE CREATE ERROR:", caseError);

      return NextResponse.json(
        {
          error: caseError?.message ?? "Failed to create case.",
        },
        { status: 500 },
      );
    }

    const transactionIds =
      intake.transactionIds.length > 0
        ? intake.transactionIds
        : [`TX-${Date.now()}`];

    for (const transactionId of transactionIds) {
      const { error: transactionError } = await client
        .from("transactions")
        .insert({
          case_id: caseRow.id,
          transaction_time: parseIncidentDateTime(intake.date, intake.time),
          transaction_type: intake.incidentType || "unauthorized",
          amount: intake.amount,
          currency: "INR",
          channel: intake.bank || "Unknown",
          reference_number: transactionId,
          disputed: true,
        });

      if (transactionError) {
        console.error("TRANSACTION CREATE ERROR:", transactionError);
      }
    }

    if (intake.evidence.length > 0) {
      for (const evidenceName of intake.evidence) {
        const { error: evidenceError } = await client.from("evidence").insert({
          case_id: caseRow.id,
          name: evidenceName,
          evidence_type: "user_submitted",
          description: `Evidence submitted with incident ${caseNumber}`,
          source: "victim",
          verified: false,
        });

        if (evidenceError) {
          console.error("EVIDENCE CREATE ERROR:", evidenceError);
        }
      }
    }

    return NextResponse.json({
      caseId: caseRow.case_number,
      caseUuid: caseRow.id,
      status: "created",
    });
  } catch (error) {
    console.error("CREATE CASE ERROR:", error);
    return apiErrorResponse(error);
  }
}
