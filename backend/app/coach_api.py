import asyncio
import json
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.dependencies import CoachServiceDependency
from app.schemas import CoachChatRequest, CoachChatResponse

router = APIRouter(prefix="/api/coach", tags=["Coach"])


@router.post("/chat", response_model=CoachChatResponse)
async def chat(payload: CoachChatRequest, service: CoachServiceDependency) -> dict[str, Any]:
    return await service.reply(payload.teamId, payload.message)


@router.post("/chat/stream")
async def stream_chat(payload: CoachChatRequest, service: CoachServiceDependency) -> StreamingResponse:
    queue: asyncio.Queue[tuple[str, Any] | None] = asyncio.Queue()

    async def progress(code: str, progress_message: str) -> None:
        await queue.put(("progress", {"code": code, "message": progress_message}))

    async def run() -> None:
        try:
            result = await service.reply(payload.teamId, payload.message, progress)
            validated = CoachChatResponse.model_validate(result).model_dump(mode="json")
            await queue.put(("complete", validated))
        except Exception:
            await queue.put(("error", {"message": "The coach could not complete this request. Try again."}))
        finally:
            await queue.put(None)

    async def events() -> AsyncIterator[str]:
        task = asyncio.create_task(run())
        try:
            while (event := await queue.get()) is not None:
                name, payload = event
                yield f"event: {name}\ndata: {json.dumps(payload, separators=(',', ':'))}\n\n"
        finally:
            await task

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"})