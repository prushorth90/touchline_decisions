import json
import logging
from typing import TypedDict

import httpx

from analysis import FplDataError, analyze_gameweek

logger = logging.getLogger(__name__)


class LambdaResponse(TypedDict):
    statusCode: int
    headers: dict[str, str]
    body: str


def handler(event: object, context: object) -> LambdaResponse:
    try:
        result = analyze_gameweek()
        status_code = 200
        body = json.dumps(result, allow_nan=False)
    except httpx.TimeoutException:
        logger.exception("FPL bootstrap request timed out")
        status_code = 504
        body = json.dumps({"error": "FPL API request timed out"})
    except (httpx.HTTPError, FplDataError):
        logger.exception("FPL gameweek analysis failed")
        status_code = 502
        body = json.dumps({"error": "Unable to analyze FPL player data"})
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json"},
        "body": body,
    }
