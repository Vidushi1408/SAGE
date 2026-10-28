"""
Guard against a model stating figures or periods that its tools never returned.

Small local models in particular will happily write "$9,999" or "August" when the data says otherwise.
This does not judge reasoning; it only checks that every dollar amount, percentage, ISO date/month and
month name in a reply can be found in what the tools returned (or in what the user themselves wrote).
"""
import re
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Iterable, List, Set

MONEY = re.compile(r"\$\s?(\d[\d,]*(?:\.\d+)?)\s?([kKmM])?(?![\w])")
PERCENT = re.compile(r"(?<![\w.])(\d[\d,]*(?:\.\d+)?)\s?%")
ISO_LABEL = re.compile(r"\b(\d{4}-\d{2}(?:-\d{2})?)\b")
MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july",
               "august", "september", "october", "november", "december"]
# "may" is also a verb, so it only counts as a month when a year follows ("May 2026").
MONTH_WORD = re.compile(r"\b(January|February|March|April|June|July|August|September|October|November|December)\b|\bMay(?=\s+\d{4})")

ABS_TOLERANCE = 0.011
REL_TOLERANCE = 0.005
SUFFIX_REL_TOLERANCE = 0.05  # "$1.7k" is a rounding of 1,688.43


@dataclass
class Verdict:
    ok: bool
    problems: List[str] = field(default_factory=list)


def _walk(value: Any, numbers: Set[float], text: List[str]) -> None:
    if isinstance(value, bool) or value is None:
        return
    if isinstance(value, (int, float)):
        numbers.add(float(value))
    elif isinstance(value, str):
        text.append(value)
    elif isinstance(value, dict):
        for k, v in value.items():
            text.append(str(k))
            _walk(v, numbers, text)
    elif isinstance(value, (list, tuple, set)):
        for v in value:
            _walk(v, numbers, text)


def _numbers_in(text: str) -> Iterable[float]:
    for m in re.finditer(r"-?\d[\d,]*(?:\.\d+)?", text):
        try:
            yield float(m.group(0).replace(",", ""))
        except ValueError:
            continue


def _matches(claimed: float, known: Set[float], suffix: bool = False) -> bool:
    for n in known:
        for candidate in (n, abs(n)):
            if abs(claimed - candidate) <= ABS_TOLERANCE:
                return True
            if candidate and abs(claimed - candidate) / abs(candidate) <= (SUFFIX_REL_TOLERANCE if suffix else REL_TOLERANCE):
                return True
            # Models round: 8.25 -> 8.3 or 8
            if claimed in (round(candidate), round(candidate, 1), round(candidate, 2)):
                return True
    return False


def _is_real_calendar_label(label: str) -> bool:
    """False for dates a model might invent, such as 2026-13 or 2026-02-30."""
    try:
        date.fromisoformat(label if len(label) == 10 else label + "-01")
    except ValueError:
        return False
    return True


def _label_known(label: str, labels: Set[str], ranges: List[tuple]) -> bool:
    if any(known == label or known.startswith(label + "-") for known in labels):
        return True
    return any(start <= label <= end for start, end in ranges)


def check_reply(reply: str, tool_results: List[Any], context: Iterable[str] = ()) -> Verdict:
    """`context` holds text the user supplied (their question and earlier turns), which may legitimately be echoed."""
    numbers: Set[float] = set()
    texts: List[str] = list(context)
    for result in tool_results:
        _walk(result, numbers, texts)
    for t in texts:
        numbers.update(_numbers_in(t))

    labels = {m.group(1) for t in texts for m in ISO_LABEL.finditer(t)}
    ranges = [(a, b) for t in texts for a, _, b in (p.partition("/") for p in re.findall(r"\d{4}-\d{2}-\d{2}/\d{4}-\d{2}-\d{2}", t)) if b]
    known_months = set()
    for label in labels:
        try:
            known_months.add(int(label[5:7]))
        except ValueError:
            pass

    problems: List[str] = []

    for m in MONEY.finditer(reply):
        claimed = float(m.group(1).replace(",", ""))
        suffix = (m.group(2) or "").lower()
        scaled = claimed * {"k": 1_000, "m": 1_000_000}.get(suffix, 1)
        if not _matches(scaled, numbers, suffix=bool(suffix)):
            problems.append(f"amount {m.group(0).strip()}")

    for m in PERCENT.finditer(reply):
        if not _matches(float(m.group(1).replace(",", "")), numbers):
            problems.append(f"percentage {m.group(0).strip()}")

    for m in ISO_LABEL.finditer(reply):
        label = m.group(1)
        if not _is_real_calendar_label(label) or not _label_known(label, labels, ranges):
            problems.append(f"period {label}")

    for m in MONTH_WORD.finditer(reply):
        name = (m.group(1) or "May").lower()
        if MONTH_NAMES.index(name) + 1 not in known_months:
            problems.append(f"month {m.group(0)}")

    return Verdict(ok=not problems, problems=problems)
