from fastapi.testclient import TestClient

from main import app


def run_smoke_test() -> int:
    client = TestClient(app)

    checks = []

    health = client.get("/health")
    checks.append(("GET /health", health.status_code == 200 and health.json().get("status") == "ok", health.json()))

    empty_match = client.get("/match")
    checks.append(("GET /match (empty)", empty_match.status_code == 200 and "message" in empty_match.json(), empty_match.json()))

    speaker = client.post("/speaker/smoke-speaker")
    checks.append(("POST /speaker", speaker.status_code == 200 and speaker.json().get("status") == "waiting", speaker.json()))

    listener = client.post("/listener/smoke-listener")
    checks.append(("POST /listener", listener.status_code == 200 and listener.json().get("status") == "waiting", listener.json()))

    match = client.get("/match")
    data = match.json()
    checks.append((
        "GET /match (paired)",
        match.status_code == 200 and data.get("speaker") == "smoke-speaker" and data.get("listener") == "smoke-listener",
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
