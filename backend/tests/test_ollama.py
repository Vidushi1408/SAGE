from app.core.config import settings
from app.services import ollama
from app.services.ai import AIService
from app.services.chat import ChatService

STATS = {
    "summary": {"total_revenue": 1000.0, "total_transactions": 10, "avg_transaction_value": 100.0},
    "period_metrics": {"weekly": [{"week": "2026-W01", "revenue": 500.0, "transactions": 5, "growth_pct": None}],
                       "monthly": [], "daily": []},
    "category_metrics": {"top_categories": [{"category": "Bread", "revenue": 600.0, "share_pct": 60.0}]},
    "anomalies": [],
}


def use_ollama(monkeypatch):
    monkeypatch.setattr(settings, "LLM_PROVIDER", "ollama")


def test_active_llm_selection(monkeypatch):
    monkeypatch.setattr(settings, "LLM_PROVIDER", "")
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "")
    assert settings.active_llm == "mock"
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "k")
    assert settings.active_llm == "anthropic"
    monkeypatch.setattr(settings, "LLM_PROVIDER", "ollama")
    assert settings.active_llm == "ollama"


def test_chat_uses_tool_result_from_ollama(monkeypatch):
    use_ollama(monkeypatch)
    replies = iter([
        {"role": "assistant", "content": "", "tool_calls": [{"function": {"name": "get_summary", "arguments": {}}}]},
        {"role": "assistant", "content": "You made $1,000.00 from 10 sales."},
    ])
    monkeypatch.setattr(ollama, "chat", lambda *a, **k: next(replies))
    out = ChatService.respond(STATS, "how much revenue?")
    assert out["content"] == "You made $1,000.00 from 10 sales."
    assert out["query_used"] == "get_summary"


def test_chat_without_tool_call_is_grounded_by_deterministic_router(monkeypatch):
    use_ollama(monkeypatch)
    monkeypatch.setattr(ollama, "chat", lambda *a, **k: {"role": "assistant", "content": "Probably $9999"})
    out = ChatService.respond(STATS, "top categories?")
    assert "Bread" in out["content"] and "9999" not in out["content"]


def test_chat_falls_back_when_ollama_down(monkeypatch):
    use_ollama(monkeypatch)
    def boom(*a, **k): raise ConnectionError("down")
    monkeypatch.setattr(ollama, "chat", boom)
    out = ChatService.respond(STATS, "top categories?")
    assert "Bread" in out["content"]


def test_chat_bad_tool_arguments_do_not_crash(monkeypatch):
    use_ollama(monkeypatch)
    replies = iter([
        {"role": "assistant", "content": "", "tool_calls": [{"function": {"name": "get_period_metrics", "arguments": {"bogus": 1}}}]},
        {"role": "assistant", "content": "Sorry, I could not find that."},
    ])
    monkeypatch.setattr(ollama, "chat", lambda *a, **k: next(replies))
    assert ChatService.respond(STATS, "weekly?")["content"]


def test_insights_valid_model_output_keeps_text_but_charts_come_from_stats(monkeypatch):
    use_ollama(monkeypatch)
    monkeypatch.setattr(ollama, "chat", lambda *a, **k: {"content": '{"recommendation": "Do X", "insights": [{"title": "T", "explanation": "E", "chart_type": "pie", "chart_data": [{"name": "fake", "value": 1}]}]}'})
    out = AIService.generate_insights(STATS)
    assert out["recommendation"] == "Do X"
    assert all(d["name"] != "fake" for i in out["insights"] for d in i["chart_data"])


def test_insights_garbage_output_falls_back_to_deterministic(monkeypatch):
    use_ollama(monkeypatch)
    monkeypatch.setattr(ollama, "chat", lambda *a, **k: {"content": "not json"})
    out = AIService.generate_insights(STATS)
    assert out["insights"] and out["recommendation"]
