export async function getCase(caseId: string) {
  const response = await fetch(`/api/cases/${caseId}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to load case: ${response.status}`);
  }

  return response.json();
}

export async function createCaseEvent(
  caseId: string,
  description: string,
) {
  const response = await fetch("/api/events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      caseId,
      eventType: "bank_response",
      description,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create event: ${response.status} ${error}`);
  }

  return response.json();
}

export async function replanCase(caseId: string) {
  const response = await fetch("/api/replan", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      caseId,
    }),
  });

  if (!response.ok) {
  const error = await response.text();
  throw new Error(`Failed to replan case: ${response.status} ${error}`);
}

  return response.json();
}