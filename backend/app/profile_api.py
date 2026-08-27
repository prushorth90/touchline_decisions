import re
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from app.api import problem
from app.database import ApplicationSetting, LocalProfile
from app.dependencies import SessionDependency
from app.domain import iso_datetime
from app.schemas import (
    ApplicationSettingResponse,
    CreateProfileRequest,
    LocalProfileResponse,
    SetApplicationSettingRequest,
    UpdateSelectedTeamRequest,
)

router = APIRouter(prefix="/api/profiles", tags=["Profiles"])
KEY_PATTERN = re.compile(r"^[A-Za-z0-9_.-]{1,100}$")


def mapped(profile: LocalProfile) -> dict[str, Any]:
    return {"id": str(profile.id), "displayName": profile.display_name, "selectedFplTeamId": profile.selected_fpl_team_id,
            "createdAt": iso_datetime(profile.created_at), "updatedAt": iso_datetime(profile.updated_at)}


def profile_id(value: str) -> uuid.UUID:
    try:
        parsed = uuid.UUID(value)
    except ValueError:
        raise HTTPException(404, problem(404, "Not Found")) from None
    if parsed.int == 0:
        raise HTTPException(400, problem(400, "Invalid profile ID."))
    return parsed


@router.get("", response_model=list[LocalProfileResponse])
async def list_profiles(session: SessionDependency) -> list[dict[str, Any]]:
    rows = (await session.scalars(select(LocalProfile).order_by(LocalProfile.display_name, LocalProfile.id))).all()
    return [mapped(row) for row in rows]


@router.get("/{profile_id_value}", response_model=LocalProfileResponse)
async def get_profile(profile_id_value: str, session: SessionDependency) -> dict[str, Any]:
    identifier = profile_id(profile_id_value)
    row = await session.get(LocalProfile, identifier)
    if row is None:
        raise HTTPException(404, problem(404, "Profile not found."))
    return mapped(row)


@router.post("", status_code=201, response_model=LocalProfileResponse)
async def create_profile(
    payload: CreateProfileRequest,
    response: Response,
    session: SessionDependency,
) -> dict[str, Any]:
    name = payload.displayName.strip()
    if not name:
        raise HTTPException(400, problem(400, "Invalid profile.", "Display name is required and team ID, when provided, must be positive."))
    now = datetime.now(UTC)
    row = LocalProfile(display_name=name, selected_fpl_team_id=payload.selectedFplTeamId, created_at=now, updated_at=now)
    async with session.begin():
        session.add(row)
    response.headers["Location"] = f"/api/profiles/{row.id}"
    return mapped(row)


@router.put("/{profile_id_value}/team", response_model=LocalProfileResponse)
async def update_team(
    profile_id_value: str,
    payload: UpdateSelectedTeamRequest,
    session: SessionDependency,
) -> dict[str, Any]:
    identifier = profile_id(profile_id_value)
    async with session.begin():
        row = await session.get(LocalProfile, identifier)
        if row is None:
            raise HTTPException(404, problem(404, "Profile not found."))
        row.selected_fpl_team_id = payload.selectedFplTeamId
        row.updated_at = datetime.now(UTC)
    return mapped(row)


@router.get("/{profile_id_value}/settings/{key}", response_model=ApplicationSettingResponse)
async def get_setting(profile_id_value: str, key: str, session: SessionDependency) -> dict[str, Any]:
    identifier = profile_id(profile_id_value)
    if KEY_PATTERN.fullmatch(key) is None:
        raise HTTPException(400, problem(400, "Invalid profile ID or setting key."))
    setting = await session.scalar(select(ApplicationSetting).where(ApplicationSetting.profile_id == identifier, ApplicationSetting.key == key))
    if setting is None:
        raise HTTPException(404, problem(404, "Setting not found."))
    return {"key": key, "value": setting.value}


@router.put("/{profile_id_value}/settings/{key}", response_model=ApplicationSettingResponse)
async def set_setting(
    profile_id_value: str,
    key: str,
    payload: SetApplicationSettingRequest,
    session: SessionDependency,
) -> dict[str, Any]:
    identifier = profile_id(profile_id_value)
    if KEY_PATTERN.fullmatch(key) is None:
        raise HTTPException(400, problem(400, "Invalid setting key."))
    async with session.begin():
        if await session.get(LocalProfile, identifier) is None:
            raise HTTPException(404, problem(404, "Profile not found."))
        statement = insert(ApplicationSetting).values(profile_id=identifier, key=key, value=payload.value, updated_at=datetime.now(UTC)).on_conflict_do_update(
            index_elements=[ApplicationSetting.profile_id, ApplicationSetting.key], set_={"ValueJson": payload.value, "UpdatedAt": datetime.now(UTC)})
        await session.execute(statement)
    return {"key": key, "value": payload.value}