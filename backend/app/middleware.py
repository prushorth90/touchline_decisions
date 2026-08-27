import asyncio
import logging
import time
import uuid
from collections import defaultdict, deque
from collections.abc import Awaitable, Callable

from fastapi import Request
from fastapi.responses import JSONResponse, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)


class ApplicationMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: object, max_body_bytes: int, requests_per_minute: int, development: bool) -> None:
        super().__init__(app)  # type: ignore[arg-type]
        self.max_body_bytes = max_body_bytes
        self.requests_per_minute = requests_per_minute
        self.development = development
        self.requests: dict[str, deque[float]] = defaultdict(deque)
        self.lock = asyncio.Lock()

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        started = time.monotonic()
        trace_id = request.headers.get("x-request-id", str(uuid.uuid4()))
        request.state.trace_id = trace_id
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > self.max_body_bytes:
            response: Response = self._problem(413, "The request body is too large.", trace_id)
        elif request.url.path != "/health" and not await self._allow(request):
            response = self._problem(429, "Too many requests.", trace_id, "Wait briefly before trying again.")
        else:
            response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        if not self.development:
            response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
        logger.info("HTTP %s %s completed with %s in %dms", request.method, request.url.path, response.status_code, (time.monotonic() - started) * 1000)
        return response

    async def _allow(self, request: Request) -> bool:
        forwarded = request.headers.get("x-forwarded-for")
        client = forwarded.split(",", 1)[0].strip() if forwarded else request.client.host if request.client else "unknown"
        now = time.monotonic()
        async with self.lock:
            values = self.requests[client]
            while values and values[0] <= now - 60:
                values.popleft()
            if len(values) >= self.requests_per_minute:
                return False
            values.append(now)
            return True

    @staticmethod
    def _problem(status: int, title: str, trace_id: str, detail: str | None = None) -> JSONResponse:
        payload = {"status": status, "title": title, "traceId": trace_id}
        if detail:
            payload["detail"] = detail
        return JSONResponse(payload, status_code=status, media_type="application/problem+json")