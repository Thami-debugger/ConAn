from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.matchmaking import JoinQueueRequest, JoinQueueResponse, MatchStatusResponse
from app.services.matchmaking import matchmaking_service
from app.services.session_store import create_session_record


router = APIRouter(prefix="/matchmaking", tags=["matchmaking"])


@router.post("/speaker", response_model=JoinQueueResponse)
async def join_speaker(payload: JoinQueueRequest, db: Session = Depends(get_db)) -> JoinQueueResponse:
    result = await matchmaking_service.join_speaker(payload.anonymous_user_id)

    if result["status"] in {"matched", "ai_fallback"}:
        create_session_record(
            db,
            session_id=result["session_id"],
            speaker_id=payload.anonymous_user_id,
            listener_id=result["peer_id"],
            listener_type=result["listener_type"],
        )

    return JoinQueueResponse(**result)


@router.post("/listener", response_model=JoinQueueResponse)
async def join_listener(payload: JoinQueueRequest, db: Session = Depends(get_db)) -> JoinQueueResponse:
    result = await matchmaking_service.join_listener(payload.anonymous_user_id)

    if result["status"] == "matched":
        create_session_record(
            db,
            session_id=result["session_id"],
            speaker_id=result["peer_id"],
            listener_id=payload.anonymous_user_id,
            listener_type="human",
        )

    return JoinQueueResponse(**result)


@router.get("/status/{anonymous_user_id}", response_model=MatchStatusResponse)
async def get_match_status(anonymous_user_id: str) -> MatchStatusResponse:
    result = await matchmaking_service.get_status(anonymous_user_id)
    return MatchStatusResponse(**result)
