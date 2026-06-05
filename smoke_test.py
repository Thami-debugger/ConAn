from fastapi.testclient import TestClient

from main import app


def run_smoke_test() -> int:
    client = TestClient(app)

    checks = []

    health = client.get("/health")
    checks.append(("GET /health", health.status_code == 200 and health.json().get("status") == "ok", health.json()))

    empty_match = client.get("/match")
    checks.append((
        "GET /match (empty)",
        empty_match.status_code == 200 and empty_match.json().get("status") == "waiting",
        empty_match.json(),
    ))

    speaker = client.post("/speaker/smoke-speaker")
    checks.append(("POST /speaker", speaker.status_code == 200 and speaker.json().get("status") == "waiting", speaker.json()))

    listener = client.post("/listener/smoke-listener")
    listener_data = listener.json()
    checks.append((
        "POST /listener",
        listener.status_code == 200
        and listener_data.get("status") == "matched"
        and listener_data.get("peer_id") == "smoke-speaker",
        listener_data,
    ))

    match = client.get("/match", params={"user_id": "smoke-speaker"})
    data = match.json()
    checks.append((
        "GET /match (paired user)",
        match.status_code == 200 and data.get("status") == "matched" and data.get("peer_id") == "smoke-listener",
        data,
    ))

    ai = client.post("/ai", params={"message": "Hello"})
    ai_data = ai.json()
    checks.append(("POST /ai", ai.status_code == 200 and "response" in ai_data, ai_data))

    print("SMOKE TEST RESULTS")
    failures = 0
    for name, passed, payload in checks:
        status = "PASS" if passed else "FAIL"
        print(f"- {name}: {status} -> {payload}")
        if not passed:
            failures += 1

    if failures:
        print(f"\nSmoke test failed: {failures} check(s) did not pass.")
        return 1

    print("\nSmoke test passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(run_smoke_test())
