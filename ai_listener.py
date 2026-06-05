import os

from openai import OpenAI

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

    response = current_client.responses.create(
        model="gpt-5",
        input=prompt
    )

    return response.output_text