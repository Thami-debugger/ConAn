from fastapi import APIRouter
from pydantic import BaseModel

from app.services.ai_listener import get_ai_response


router = APIRouter(prefix="/ai", tags=["ai"])


class AiMessageRequest(BaseModel):
    text: str


class AiMessageResponse(BaseModel):
    response: str


@router.post("/listen", response_model=AiMessageResponse)
def ai_listen(payload: AiMessageRequest) -> AiMessageResponse:
    return AiMessageResponse(response=get_ai_response(payload.text))
