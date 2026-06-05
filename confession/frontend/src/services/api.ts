const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

export type Role = "speaker" | "listener";

export type JoinResult = {
  status: "waiting" | "matched" | "ai_fallback";
  session_id: string | null;
  peer_id: string | null;
  listener_type: "human" | "ai" | null;
};

export async function createAnonymousId(): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/v1/anonymous-id`, { method: "POST" });
  const data = await res.json();
  return data.anonymous_user_id;
}

export async function joinQueue(role: Role, anonymousUserId: string): Promise<JoinResult> {
  const endpoint = role === "speaker" ? "speaker" : "listener";
  const res = await fetch(`${API_BASE_URL}/v1/matchmaking/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ anonymous_user_id: anonymousUserId }),
  });
  return res.json();
}

export async function askAi(text: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/v1/ai/listen`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const data = await res.json();
  return data.response;
}

export async function endSession(sessionId: string, anonymousUserId: string, transcript = ""): Promise<void> {
  await fetch(`${API_BASE_URL}/v1/sessions/${sessionId}/end`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ anonymous_user_id: anonymousUserId, transcript }),
  });
}

export async function reportSession(sessionId: string, anonymousUserId: string, reason: string): Promise<void> {
  await fetch(`${API_BASE_URL}/v1/sessions/${sessionId}/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ anonymous_user_id: anonymousUserId, reason }),
  });
}
