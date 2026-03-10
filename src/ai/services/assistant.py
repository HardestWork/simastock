"""Core assistant service — handles the tool_use loop with Claude."""
import json
import logging

from django.db import transaction

from ai.models import AIConversation, AIMessage, AIFeature
from .client import chat_completion, log_usage, stream_chat_completion, check_and_consume_credits
from .prompts import ASSISTANT_SYSTEM_PROMPT, build_system_prompt
from .tools import TOOL_DEFINITIONS, execute_tool

logger = logging.getLogger("boutique")

MAX_TOOL_ROUNDS = 5


def get_or_create_conversation(user, store, conversation_id=None):
    """Get existing conversation or create a new one."""
    if conversation_id:
        try:
            return AIConversation.objects.get(
                pk=conversation_id,
                user=user,
                store=store,
                status=AIConversation.Status.ACTIVE,
            )
        except AIConversation.DoesNotExist:
            pass

    return AIConversation.objects.create(
        user=user,
        store=store,
        feature=AIFeature.ASSISTANT,
        title="",
    )


def build_messages_for_api(conversation, new_user_message: str) -> list[dict]:
    """Build the messages list from conversation history + new message."""
    messages = []

    # Load recent history (last 20 messages to keep context manageable)
    history = conversation.messages.order_by("created_at")[:20]
    for msg in history:
        if msg.role == AIMessage.Role.SYSTEM:
            continue
        entry = {"role": msg.role, "content": msg.content}
        messages.append(entry)

    # Add new user message
    messages.append({"role": "user", "content": new_user_message})
    return messages


def chat(user, store, message: str, conversation_id=None) -> dict:
    """Process a chat message through the assistant with tool_use loop.

    Returns dict with: conversation_id, response, title.
    """
    # Check and consume 1 credit
    enterprise = store.enterprise if store else None
    if enterprise:
        check_and_consume_credits(enterprise, amount=1)

    conversation = get_or_create_conversation(user, store, conversation_id)
    system_prompt = build_system_prompt(ASSISTANT_SYSTEM_PROMPT, store, user)
    messages = build_messages_for_api(conversation, message)

    # Save user message
    AIMessage.objects.create(
        conversation=conversation,
        role=AIMessage.Role.USER,
        content=message,
    )

    # Tool-use loop
    total_tokens_in = 0
    total_tokens_out = 0
    final_content = ""

    for _round in range(MAX_TOOL_ROUNDS):
        result = chat_completion(
            messages=messages,
            system=system_prompt,
            tools=TOOL_DEFINITIONS,
            max_tokens=4096,
        )

        total_tokens_in += result["tokens_input"]
        total_tokens_out += result["tokens_output"]

        if result["tool_use"]:
            # Execute each tool call
            tool_results = []
            for tool_call in result["tool_use"]:
                tool_result = execute_tool(tool_call["name"], tool_call["input"], store)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_call["id"],
                    "content": json.dumps(tool_result, ensure_ascii=False),
                })

            # Add assistant message with tool_use blocks + tool results
            messages.append({
                "role": "assistant",
                "content": result.get("raw_content", result["content"]) or [
                    {"type": "tool_use", "id": tc["id"], "name": tc["name"], "input": tc["input"]}
                    for tc in result["tool_use"]
                ],
            })
            messages.append({"role": "user", "content": tool_results})
        else:
            # No more tool calls — we have the final answer
            final_content = result["content"]
            break
    else:
        final_content = result.get("content", "Desole, je n'ai pas pu completer l'analyse.")

    # Auto-generate title from first message
    if not conversation.title and message:
        conversation.title = message[:100]
        conversation.save(update_fields=["title", "updated_at"])

    # Save assistant response
    AIMessage.objects.create(
        conversation=conversation,
        role=AIMessage.Role.ASSISTANT,
        content=final_content,
        tokens_input=total_tokens_in,
        tokens_output=total_tokens_out,
        model=result.get("model", ""),
        duration_ms=result.get("duration_ms", 0),
    )

    # Log usage
    enterprise = store.enterprise if store else None
    log_usage(
        enterprise=enterprise,
        store=store,
        user=user,
        feature=AIFeature.ASSISTANT,
        model=result.get("model", ""),
        tokens_in=total_tokens_in,
        tokens_out=total_tokens_out,
    )

    return {
        "conversation_id": str(conversation.pk),
        "response": final_content,
        "title": conversation.title,
        "tokens": total_tokens_in + total_tokens_out,
    }


def stream_chat(user, store, message: str, conversation_id=None):
    """Stream a chat response using SSE.

    Yields SSE-formatted strings: data: {...}\\n\\n
    """
    # Check and consume 1 credit
    enterprise = store.enterprise if store else None
    if enterprise:
        check_and_consume_credits(enterprise, amount=1)

    conversation = get_or_create_conversation(user, store, conversation_id)
    system_prompt = build_system_prompt(ASSISTANT_SYSTEM_PROMPT, store, user)
    messages = build_messages_for_api(conversation, message)

    # Save user message
    AIMessage.objects.create(
        conversation=conversation,
        role=AIMessage.Role.USER,
        content=message,
    )

    # First, do tool-use rounds synchronously (can't stream these)
    total_tokens_in = 0
    total_tokens_out = 0

    for _round in range(MAX_TOOL_ROUNDS):
        result = chat_completion(
            messages=messages,
            system=system_prompt,
            tools=TOOL_DEFINITIONS,
            max_tokens=4096,
        )
        total_tokens_in += result["tokens_input"]
        total_tokens_out += result["tokens_output"]

        if result["tool_use"]:
            tool_results = []
            for tool_call in result["tool_use"]:
                tool_result = execute_tool(tool_call["name"], tool_call["input"], store)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_call["id"],
                    "content": json.dumps(tool_result, ensure_ascii=False),
                })
            messages.append({
                "role": "assistant",
                "content": [
                    {"type": "tool_use", "id": tc["id"], "name": tc["name"], "input": tc["input"]}
                    for tc in result["tool_use"]
                ],
            })
            messages.append({"role": "user", "content": tool_results})
        else:
            break

    # Now stream the final response
    # Remove tools for the final streaming call since tool rounds are done
    full_content = ""
    yield f'data: {json.dumps({"type": "start", "conversation_id": str(conversation.pk)})}\n\n'

    for chunk in stream_chat_completion(
        messages=messages,
        system=system_prompt,
        max_tokens=4096,
    ):
        if chunk["type"] == "text_delta":
            full_content += chunk["data"]
            yield f'data: {json.dumps({"type": "text", "content": chunk["data"]})}\n\n'
        elif chunk["type"] == "done":
            meta = chunk.get("metadata", {})
            total_tokens_in += meta.get("tokens_input", 0)
            total_tokens_out += meta.get("tokens_output", 0)

    # Auto title
    if not conversation.title and message:
        conversation.title = message[:100]
        conversation.save(update_fields=["title", "updated_at"])

    # Save assistant message
    AIMessage.objects.create(
        conversation=conversation,
        role=AIMessage.Role.ASSISTANT,
        content=full_content,
        tokens_input=total_tokens_in,
        tokens_output=total_tokens_out,
        model=result.get("model", "") if result else "",
        duration_ms=0,
    )

    # Log usage
    enterprise = store.enterprise if store else None
    log_usage(
        enterprise=enterprise,
        store=store,
        user=user,
        feature=AIFeature.ASSISTANT,
        model=result.get("model", "") if result else "",
        tokens_in=total_tokens_in,
        tokens_out=total_tokens_out,
    )

    yield f'data: {json.dumps({"type": "done", "conversation_id": str(conversation.pk), "title": conversation.title})}\n\n'
