import random

from openai import OpenAI

from app.core.config import settings


FALLBACK_RESPONSES = [
    "I'm listening.",
    "Tell me more.",
    "That sounds important.",
    "What happened next?",
]


SYSTEM_PROMPT = (
    "You are a calm, compassionate active listener. "
    "Do not provide diagnosis, medical advice, or therapy. "
    "Keep responses short and supportive, and encourage the user to continue speaking."
)


def get_ai_response(user_text: str) -> str:
    if not settings.openai_api_key:
        return random.choice(FALLBACK_RESPONSES)

    try:
        client = OpenAI(api_key=settings.openai_api_key)
        response = client.responses.create(
            model="gpt-5",
            input=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_text},
            ],
            max_output_tokens=90,
        )
        output = response.output_text.strip()
        return output or random.choice(FALLBACK_RESPONSES)
    except Exception:
        return random.choice(FALLBACK_RESPONSES)
