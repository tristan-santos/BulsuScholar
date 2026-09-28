import json
import os
import sys
import urllib.error
import urllib.request


def main() -> int:
    base_url = os.getenv("BACKEND_API_URL", "https://api.bulsuscholar.com").strip().rstrip("/")
    secret = os.getenv("CRON_SECRET", "").strip()
    if len(secret) < 32:
        print("CRON_SECRET must contain at least 32 characters.", file=sys.stderr)
        return 2

    request = urllib.request.Request(
        f"{base_url}/internal/cron/waitlist/expire",
        data=b"{}",
        headers={"Content-Type": "application/json", "X-Cron-Secret": secret},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        print(f"Waitlist expiry failed: {error}", file=sys.stderr)
        return 1

    if not payload.get("ok"):
        print(f"Waitlist expiry returned an error: {payload}", file=sys.stderr)
        return 1
    print(json.dumps(payload, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
