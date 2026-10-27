import logging
from contextlib import closing

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from pydantic import ValidationError

from app.config import Settings
from app.schemas import GameweekInsightsResponse

logger = logging.getLogger(__name__)
REPORT_KEY = "reports/latest.json"


class GameweekReportError(Exception):
    """The gameweek report could not be retrieved or validated."""


class GameweekReportNotFound(GameweekReportError):
    """No report has been published yet."""


class GameweekReportUnavailable(GameweekReportError):
    """The configured report source is unavailable."""


class GameweekInsightsService:
    def __init__(self, settings: Settings) -> None:
        self.source = settings.insights_source
        self.fixture_path = settings.insights_fixture_path
        self.bucket = settings.report_bucket

    def get_report(self) -> GameweekInsightsResponse:
        if self.source == "fixture":
            try:
                payload = self.fixture_path.read_bytes()
            except FileNotFoundError as error:
                logger.warning("Gameweek report fixture not found")
                raise GameweekReportNotFound from error
            except OSError as error:
                logger.error("Unable to read gameweek report fixture")
                raise GameweekReportUnavailable from error
        else:
            payload = self._read_s3()
        try:
            return GameweekInsightsResponse.model_validate_json(payload)
        except ValidationError as error:
            logger.error("Gameweek report does not match the expected schema")
            raise GameweekReportError from error

    def _read_s3(self) -> bytes:
        if not self.bucket.strip():
            logger.error("REPORT_BUCKET is required for S3 insights")
            raise GameweekReportUnavailable
        try:
            with closing(boto3.client(
                "s3",
                config=Config(
                    connect_timeout=3,
                    read_timeout=5,
                    retries={"total_max_attempts": 3, "mode": "standard"},
                ),
            )) as client:
                response = client.get_object(Bucket=self.bucket, Key=REPORT_KEY)
                with closing(response["Body"]) as body:
                    return body.read()
        except ClientError as error:
            if error.response["Error"].get("Code") == "NoSuchKey":
                logger.warning("Gameweek report has not been published")
                raise GameweekReportNotFound from error
            logger.error("AWS rejected the gameweek report request")
            raise GameweekReportUnavailable from error
        except (BotoCoreError, OSError) as error:
            logger.error("Unable to retrieve gameweek report from AWS")
            raise GameweekReportUnavailable from error
