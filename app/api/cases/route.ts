import { NextResponse } from "next/server";
import {
  requireApiClient,
  apiErrorResponse,
  readJson,
} from "@/lib/api/http";
import { parseIntakePayload } from "@/lib/case/intake";

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

    const caseId = `CG-${Date.now().toString().slice(-8)}`;

    const caseInsert = await client.from("cases").insert({
      case_id: caseId,
      status: "open",
      account: intake.account,
      disputed_amount: intake.amount,
      disputed_transaction_count: intake.transactionIds.length || 1,
    });

    if (caseInsert.error) {
      console.error("CASE INSERT ERROR:", caseInsert.error);

      // Existing demo case fallback.
      // This keeps the hackathon demo functional if the teammate's
      // Supabase schema differs from the local integration.
      return NextResponse.json({
        caseId: "CG-001",
        fallback: true,
      });
    }

    const transactionIds =
      intake.transactionIds.length > 0
        ? intake.transactionIds
        : [`TX-${Date.now()}`];

    for (const transactionId of transactionIds) {
      const transactionInsert = await client
        .from("transactions")
        .insert({
          case_id: caseId,
          transaction_id: transactionId,
          transaction_time: `${intake.date} ${intake.time}`.trim(),
          amount: intake.amount,
          account: intake.account,
          channel: intake.bank || "Unknown",
          disputed: true,
        });

      if (transactionInsert.error) {
        console.error(
          "TRANSACTION INSERT ERROR:",
          transactionInsert.error,
        );
      }
    }

    return NextResponse.json({
      caseId,
      status: "created",
    });
  } catch (error) {
    console.error("CREATE CASE ERROR:", error);
    return apiErrorResponse(error);
  }
}