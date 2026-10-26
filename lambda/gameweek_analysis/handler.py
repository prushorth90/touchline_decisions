import json
import logging
import os
from typing import TypedDict

import boto3
import httpx
from analysis import FplDataError, analyze_gameweek
from botocore.exceptions import BotoCoreError, ClientError

logger = logging.getLogger(__name__)


class LambdaResponse(TypedDict):
    statusCode: int
    headers: dict[str, str]
    body: str


def handler(event: object, context: object) -> LambdaResponse:
    try:
        result = analyze_gameweek()
        report = {"players": result["players"], "generatedAt": result["generated_at"]}
        report_body = json.dumps(report, allow_nan=False).encode("utf-8")
        bucket_name = os.environ.get("REPORT_BUCKET")
        if not bucket_name or not bucket_name.strip():
            raise RuntimeError("REPORT_BUCKET must be configured")
        boto3.client("s3").put_object(
            Bucket=bucket_name,
            Key="reports/latest.json",
            Body=report_body,
            ContentType="application/json",
        )
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
    except (BotoCoreError, ClientError):
        logger.exception("Unable to upload gameweek report to S3")
        status_code = 500
        body = json.dumps({"error": "Unable to store gameweek report"})
    except Exception:
        logger.exception("Unexpected gameweek report failure")
        raise
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json"},
        "body": body,
    }
