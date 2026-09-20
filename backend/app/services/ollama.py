"""Thin client for a local Ollama server (https://ollama.com). Plain httpx, no SDK."""
from typing import Any, Dict, List, Optional

import httpx

from app.core.config import settings


def chat(messages: List[Dict[str, Any]], tools: Optional[List[Dict[str, Any]]] = None,
         json_mode: bool = False) -> Dict[str, Any]:
    """POST /api/chat and return the assistant message dict. Temperature 0 for repeatable answers."""
    payload: Dict[str, Any] = {
        "model": settings.OLLAMA_MODEL,
        "messages": messages,
        "stream": False,
        "options": {"temperature": 0, "seed": 42},
    }
    if tools:
        payload["tools"] = tools
    if json_mode:
        payload["format"] = "json"
    resp = httpx.post(f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/chat", json=payload,
                      timeout=settings.OLLAMA_TIMEOUT_SECONDS)
    resp.raise_for_status()
    return resp.json()["message"]


def to_ollama_tools(definitions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [{"type": "function", "function": {
        "name": d["name"], "description": d["description"], "parameters": d["input_schema"]}}
        for d in definitions]
