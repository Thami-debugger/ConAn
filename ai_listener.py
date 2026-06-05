import os

from openai import OpenAI
from dotenv import load_dotenv


load_dotenv()

client = None


def _get_client():
    global client

    if client is not None:
        return client

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None

    client = OpenAI(api_key=api_key)
    return client

def listen(message):
    current_client = _get_client()

    if current_client is None:
        return "AI listener is currently unavailable. Please set OPENAI_API_KEY."

    prompt = f"""
    You are a compassionate listener.

    Do not give advice.

    Just listen.

    User:
    {message}
    """

    models_to_try = []
    preferred_model = os.getenv("OPENAI_MODEL", "").strip()
    if preferred_model:
        models_to_try.append(preferred_model)

    for fallback in ["gpt-4o-mini", "gpt-4.1-mini", "gpt-3.5-turbo"]:
        if fallback not in models_to_try:
            models_to_try.append(fallback)

    last_error = None

    for model_name in models_to_try:
        try:
            response = current_client.chat.completions.create(
                model=model_name,
                messages=[
                    {
                        "role": "system",
                        "content": "You are a compassionate listener. Do not give advice. Keep replies brief and supportive."
                    },
                    {"role": "user", "content": message}
                ]
            )
            content = response.choices[0].message.content
            if content:
                return content
        except Exception as exc:
            last_error = exc
            continue

    if last_error:
        error_text = str(last_error)
        lowered = error_text.lower()
        print(f"OPENAI_LISTENER_ERROR: {type(last_error).__name__}: {last_error}")

        if "insufficient_quota" in lowered or "exceeded your current quota" in lowered:
            return "OpenAI key is configured, but the account has no available quota."

        if "incorrect api key" in lowered or "invalid_api_key" in lowered:
            return "OPENAI_API_KEY appears invalid."

    return "AI listener is currently unavailable. Please verify OPENAI_API_KEY and internet access."