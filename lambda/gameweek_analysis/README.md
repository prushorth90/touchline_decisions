# Gameweek analysis Lambda

Standalone Python **3.13** code. No FastAPI, PostgreSQL, Redis, AWS SDK,
credentials, or service initialization is needed. Nothing is deployed by these
instructions.

## Run locally

From the repository root:

```bash
cd lambda/gameweek_analysis
python3.13 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
python -m pytest
python invoke_local.py
```

[invoke_local.py](./invoke_local.py) is a small Python test script that calls the
real handler and prints its status and decoded JSON. It makes a live, read-only
request to the official FPL API; unlike the pytest suite, it needs internet access.
It exits with status 1 if the handler reports failure.

Equivalent Python invocation from this directory:

```python
import json
from handler import handler

response = handler({}, None)
print(response["statusCode"])
print(json.dumps(json.loads(response["body"]), indent=2))
```

For an offline invocation, run
`python -m pytest tests/test_gameweek_analysis.py -k handler_returns_json`.
All pytest HTTP responses are mocked, so tests never contact FPL.

Run the remaining checks:

```bash
ruff check --config ../../backend/pyproject.toml .
mypy --strict --python-version 3.13 analysis.py handler.py invoke_local.py
```

## Response contract

The Lambda entry point is `handler.handler`: file `handler.py`, function
`handler`. The files in this directory are intended to be at the root of a
future Lambda deployment package, along with dependencies from
`requirements.txt`. Select the `python3.13` runtime if deploying later.

The handler returns an HTTP-style envelope with `statusCode`, `headers`, and a
JSON-encoded string in `body`. For a direct Lambda invocation, decode `body` to
read the analysis. No API Gateway or other AWS integration is configured.

Illustrative successful body (shortened):

```json
{
  "players": [
    {"name": "Example", "form": 8.5, "total_points": 120}
  ],
  "generated_at": "2026-10-26T21:00:00+00:00"
}
```

- Fetches `https://fantasy.premierleague.com/api/bootstrap-static/` once per call.
- Uses the official `elements[].form` metric, converted to a number, descending.
  This is FPL's supplied recent form, not a custom prediction.
- Returns exactly five players when at least five exist, otherwise all available
  players. An empty `elements` list produces an empty result.
- Uses `web_name` as the player's familiar FPL display name.
- Preserves API order for equal form; total points do not affect ranking.
- Uses one UTC generation timestamp for the entire analysis.
- Fails the whole analysis on invalid data rather than silently excluding players
  or assigning fabricated form values.
- Returns 504 for HTTP timeouts and 502 for other upstream HTTP, JSON, or data
  errors. The body contains `error`; the underlying exception is logged.
- Does not suppress unexpected programming errors.

The connect timeout is 3 seconds; read, write, and pool timeouts are each
10 seconds. These are HTTP phase/inactivity timeouts, **not** an overall
wall-clock deadline. There are no automatic retries. For future AWS deployment,
allow enough Lambda execution time (for example, 30 seconds) for normal requests.

Each invocation creates and closes its own HTTP client and builds a new result.
There is no cache or mutable cross-invocation business state.

## Execution flow, statement by statement

### [handler.py](./handler.py)

1. `import json` supplies JSON encoding.
2. `import logging` supplies standard Python error logging.
3. `TypedDict` describes the response shape for type checking.
4. `import httpx` provides the HTTP exception types.
5. The `from analysis ...` statement imports only standalone analysis code.
6. `logger = ...` obtains a logger; it does not open network connections.
7. `LambdaResponse` describes the integer status, string headers, and string body.
8. `handler(event, context)` is the Lambda entry point. Neither argument is
   needed for this first version, so both are ignored.
9. `try` begins the expected-success path.
10. `result = analyze_gameweek()` fetches and ranks players.
11. `status_code = 200` marks a successful analysis.
12. `json.dumps(..., allow_nan=False)` serializes the result and disallows
    nonstandard JSON numbers.
13. The timeout `except` catches HTTP timeouts specifically.
14. `logger.exception(...)` records the cause and traceback.
15. `status_code = 504` identifies an upstream timeout.
16. `json.dumps({"error": ...})` creates a safe, readable error body.
17. The next `except` catches HTTP failures and explicitly validated data errors.
18. Its logger call records the underlying cause.
19. `status_code = 502` identifies an unusable upstream response.
20. Its JSON encoding produces the corresponding error message.
21. The final `return` puts the status, JSON content-type header, and serialized
    body into the Lambda response envelope.

### [analysis.py](./analysis.py)

1. `math` supplies the finite-number check.
2. `UTC` and `datetime` supply timezone-aware timestamps.
3. `TypedDict` describes the output dictionaries.
4. `httpx` supplies the HTTP client.
5. `BOOTSTRAP_URL` holds the official FPL endpoint.
6. `HTTP_TIMEOUT` defines explicit timeout limits without making a request.
7. `FplDataError` names an expected upstream-data validation failure.
8. `PlayerSummary` defines `name`, numeric `form`, and integer `total_points`.
9. `AnalysisResult` defines the player list and generation timestamp.
10. `parse_player(item)` validates and converts one upstream player.
11. Its first `if` and `raise` reject anything other than an object.
12. The three `.get(...)` assignments read the fields used by this Lambda.
13. The name check rejects missing, non-string, or blank names.
14. The form type check rejects missing values, booleans, and nonnumeric objects.
15. `float(raw_form)` converts string form such as `"9.5"` to a sortable number.
16. Its `except` turns invalid conversion into a clear `FplDataError`, preserving
    the original cause with `from error`.
17. `math.isfinite(form)` rejects infinity and NaN.
18. The total-points check requires an integer and explicitly excludes booleans
    (Python otherwise treats booleans as integers).
19. The `return` creates a small output dictionary, trimming name whitespace.
20. `analyze_gameweek()` starts a fresh analysis.
21. `with httpx.Client(...)` opens a timeout-configured client and ensures it
    closes even if a request or parsing step fails.
22. `client.get(...)` requests the official bootstrap data.
23. `raise_for_status()` rejects unsuccessful HTTP responses.
24. `response.json()` decodes the response.
25. Its `except` converts invalid JSON into `FplDataError`.
26. The payload check requires an object containing an `elements` list.
27. The list comprehension validates and converts every player.
28. `players.sort(...)` sorts numerically by descending recent form. Equal forms
    retain their original order.
29. The final `return` takes the first five players and generates a fresh
    timezone-aware ISO 8601 UTC timestamp.

### [invoke_local.py](./invoke_local.py)

1. `json` provides readable output formatting.
2. `from handler import handler` loads the same entry point Lambda would call.
3. The `__main__` guard runs the script only when executed directly.
4. `handler({}, None)` supplies an empty event and no AWS context.
5. The first `print` shows the status.
6. The second decodes `body` and prints indented JSON.
7. The final `if` and `SystemExit(1)` make a reported failure visible to the shell.

## Why not import the backend client?

The existing [FPL module](../../backend/app/fpl.py) combines the asynchronous API
client, Redis caching, and backend domain mapping. Importing it would pull in
unnecessary application dependencies. This version follows its `httpx` and
`raise_for_status()` pattern but keeps a small synchronous client and only the
fields needed here. No existing routes or frontend code are changed.
