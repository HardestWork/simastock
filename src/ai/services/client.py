"""Anthropic Claude API client wrapper with logging, caching, and cost tracking."""
import hashlib
import logging
import time
from decimal import Decimal

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger("boutique")

# Cost per million tokens (approximate, updated May 2025)
MODEL_COSTS = {
    "claude-sonnet-4-20250514": {"input": Decimal("3.00"), "output": Decimal("15.00")},
    "claude-opus-4-20250514": {"input": Decimal("15.00"), "output": Decimal("75.00")},
    "claude-haiku-4-5-20251001": {"input": Decimal("0.80"), "output": Decimal("4.00")},
}


def get_client():
    """Return an Anthropic client instance."""
    try:
        import anthropic
    except ImportError:
        raise ImportError("Le package 'anthropic' n'est pas installe. pip install anthropic")

    api_key = getattr(settings, "ANTHROPIC_API_KEY", "")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY n'est pas configure dans les settings.")

    return anthropic.Anthropic(api_key=api_key)


def get_default_model():
    return getattr(settings, "AI_MODEL_DEFAULT", "claude-sonnet-4-20250514")


def get_complex_model():
    return getattr(settings, "AI_MODEL_COMPLEX", "claude-opus-4-20250514")


def estimate_cost(model: str, tokens_in: int, tokens_out: int) -> Decimal:
    """Estimate cost in USD for a given model and token counts."""
    costs = MODEL_COSTS.get(model)
    if not costs:
        return Decimal("0")
    return (
        costs["input"] * Decimal(tokens_in) / Decimal("1000000")
        + costs["output"] * Decimal(tokens_out) / Decimal("1000000")
    ).quantize(Decimal("0.000001"))


def make_cache_key(store_id: str, feature: str, prompt_hash: str) -> str:
    """Generate a deterministic cache key."""
    raw = f"{store_id}:{feature}:{prompt_hash}"
    return hashlib.sha256(raw.encode()).hexdigest()[:64]


def check_cache(store, feature: str, prompt_hash: str):
    """Check if a cached response exists and is still valid."""
    from ai.models import AIResponseCache

    cache_key = make_cache_key(str(store.pk), feature, prompt_hash)
    try:
        entry = AIResponseCache.objects.get(
            cache_key=cache_key,
            expires_at__gt=timezone.now(),
        )
        return entry.response
    except AIResponseCache.DoesNotExist:
        return None


def save_cache(store, feature: str, prompt_hash: str, response: str, ttl_seconds: int = 3600):
    """Save a response to cache."""
    from ai.models import AIResponseCache

    cache_key = make_cache_key(str(store.pk), feature, prompt_hash)
    AIResponseCache.objects.update_or_create(
        cache_key=cache_key,
        defaults={
            "store": store,
            "feature": feature,
            "response": response,
            "expires_at": timezone.now() + timezone.timedelta(seconds=ttl_seconds),
        },
    )


def check_and_consume_credits(enterprise, amount: int = 1):
    """Check if enterprise has enough AI credits and consume them.

    Raises ValueError if insufficient credits.
    """
    from ai.models import AICreditBalance, AICreditTransaction

    balance, _ = AICreditBalance.objects.get_or_create(
        enterprise=enterprise,
        defaults={"balance": 100},
    )
    balance.consume(amount)

    # Log consumption
    AICreditTransaction.objects.create(
        enterprise=enterprise,
        transaction_type=AICreditTransaction.TransactionType.CONSUMPTION,
        amount=-amount,
        balance_after=balance.balance,
        description="Utilisation assistant IA",
    )


def log_usage(enterprise, store, user, feature: str, model: str,
              tokens_in: int, tokens_out: int, cached: bool = False):
    """Log AI usage for billing and monitoring."""
    from ai.models import AIUsageLog

    AIUsageLog.objects.create(
        enterprise=enterprise,
        store=store,
        user=user,
        feature=feature,
        model=model,
        tokens_input=tokens_in,
        tokens_output=tokens_out,
        estimated_cost_usd=estimate_cost(model, tokens_in, tokens_out),
        cached=cached,
    )


def chat_completion(
    messages: list[dict],
    system: str = "",
    tools: list[dict] | None = None,
    model: str | None = None,
    max_tokens: int = 4096,
    temperature: float = 0.3,
) -> dict:
    """Call Claude API and return the response with metadata.

    Returns dict with keys: content, role, tool_use, tokens_input, tokens_output,
    model, duration_ms, stop_reason.
    """
    client = get_client()
    model = model or get_default_model()

    kwargs = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": messages,
        "temperature": temperature,
    }
    if system:
        kwargs["system"] = system
    if tools:
        kwargs["tools"] = tools

    start = time.monotonic()
    response = client.messages.create(**kwargs)
    duration_ms = int((time.monotonic() - start) * 1000)

    # Extract content
    text_parts = []
    tool_uses = []
    for block in response.content:
        if block.type == "text":
            text_parts.append(block.text)
        elif block.type == "tool_use":
            tool_uses.append({
                "id": block.id,
                "name": block.name,
                "input": block.input,
            })

    return {
        "content": "\n".join(text_parts),
        "role": "assistant",
        "tool_use": tool_uses,
        "tokens_input": response.usage.input_tokens,
        "tokens_output": response.usage.output_tokens,
        "model": model,
        "duration_ms": duration_ms,
        "stop_reason": response.stop_reason,
    }


def stream_chat_completion(
    messages: list[dict],
    system: str = "",
    tools: list[dict] | None = None,
    model: str | None = None,
    max_tokens: int = 4096,
    temperature: float = 0.3,
):
    """Stream Claude API response, yielding chunks as they arrive.

    Yields dicts with: type (text_delta|tool_use|done), data, metadata.
    """
    client = get_client()
    model = model or get_default_model()

    kwargs = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": messages,
        "temperature": temperature,
    }
    if system:
        kwargs["system"] = system
    if tools:
        kwargs["tools"] = tools

    start = time.monotonic()
    tokens_in = 0
    tokens_out = 0

    with client.messages.stream(**kwargs) as stream:
        for event in stream:
            if hasattr(event, "type"):
                if event.type == "content_block_delta":
                    if hasattr(event.delta, "text"):
                        yield {"type": "text_delta", "data": event.delta.text}
                elif event.type == "message_start":
                    if hasattr(event.message, "usage"):
                        tokens_in = event.message.usage.input_tokens
                elif event.type == "message_delta":
                    if hasattr(event, "usage") and event.usage:
                        tokens_out = event.usage.output_tokens

    duration_ms = int((time.monotonic() - start) * 1000)
    yield {
        "type": "done",
        "data": "",
        "metadata": {
            "tokens_input": tokens_in,
            "tokens_output": tokens_out,
            "model": model,
            "duration_ms": duration_ms,
        },
    }
