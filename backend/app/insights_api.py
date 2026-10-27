from fastapi import APIRouter, HTTPException

from app.dependencies import GameweekInsightsServiceDependency
from app.insights import GameweekReportError, GameweekReportNotFound, GameweekReportUnavailable
from app.schemas import GameweekInsightsResponse, ProblemDetails

router = APIRouter(prefix="/api/insights", tags=["Insights"])


@router.get(
    "/gameweek",
    response_model=GameweekInsightsResponse,
    responses={
        404: {"model": ProblemDetails},
        502: {"model": ProblemDetails},
        503: {"model": ProblemDetails},
    },
)
def gameweek_insights(service: GameweekInsightsServiceDependency) -> GameweekInsightsResponse:
    try:
        return service.get_report()
    except GameweekReportNotFound as error:
        raise HTTPException(status_code=404, detail="Gameweek report not found.") from error
    except GameweekReportUnavailable as error:
        raise HTTPException(status_code=503, detail="Gameweek insights are temporarily unavailable.") from error
    except GameweekReportError as error:
        raise HTTPException(status_code=502, detail="The gameweek report is invalid.") from error
