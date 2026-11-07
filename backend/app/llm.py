from collections.abc import AsyncIterator
from functools import lru_cache

from openai import AsyncOpenAI

from app.config import get_settings

ChatMessage = dict[str, str]


class LLM:
    def __init__(self) -> None:
        settings = get_settings()
        self.settings = settings
        self.helper_client = AsyncOpenAI(api_key=settings.groq_api_key, base_url=settings.groq_base_url)
        self.thread_client = AsyncOpenAI(api_key=settings.openrouter_api_key, base_url=settings.openrouter_base_url)

    async def helper(self, messages: list[ChatMessage]) -> str:
        response = await self.helper_client.chat.completions.create(
            model=self.settings.helper_model,
            messages=messages,
            temperature=0,
        )
        return response.choices[0].message.content or ""

    async def stream_thread(self, messages: list[ChatMessage]) -> AsyncIterator[str]:
        if self.settings.thread_model_system_as_user:
            messages = fold_system(messages)
        stream = await self.thread_client.chat.completions.create(
            model=self.settings.thread_model,
            messages=messages,
            stream=True,
        )
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content


def fold_system(messages: list[ChatMessage]) -> list[ChatMessage]:
    system = "\n\n".join(m["content"] for m in messages if m["role"] == "system")
    rest = [m for m in messages if m["role"] != "system"]
    if not system:
        return rest
    if rest and rest[0]["role"] == "user":
        return [{"role": "user", "content": f"{system}\n\n---\n\n{rest[0]['content']}"}, *rest[1:]]
    return [{"role": "user", "content": system}, *rest]


@lru_cache
def get_llm() -> LLM:
    return LLM()
