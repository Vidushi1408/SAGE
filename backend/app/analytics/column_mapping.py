import re
from typing import Dict, List, Tuple

import pandas as pd

# Canonical SAGE column -> accepted header spellings (compared after normalisation).
COLUMN_SYNONYMS: Dict[str, List[str]] = {
    "Date": [
        "date", "timestamp", "created at", "dt", "order date", "transaction date", "sale date",
        "sales date", "purchase date", "invoice date", "datetime", "day", "time",
    ],
    "Amount": [
        "amount", "sales", "value", "price", "revenue", "total", "total price", "total amount",
        "total sales", "order total", "line total", "subtotal", "net sales", "gross sales",
        "sale amount", "sales amount", "amount paid", "payment", "income", "grand total",
    ],
    "Category": [
        "category", "type", "dept", "department", "product", "product category", "item",
        "item category", "product type", "segment",
    ],
    "Quantity": [
        "quantity", "qty", "count", "units", "units sold", "items sold", "unit sold",
    ],
}


def normalise_header(name: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[_\-]+", " ", str(name).strip().lower()))


def map_columns(df: pd.DataFrame) -> Tuple[pd.DataFrame, Dict[str, str]]:
    """
    Rename recognised headers to the canonical Date/Amount/Category/Quantity names.
    Returns the renamed frame and {canonical: original header} for what was recognised.
    Only the first matching column per canonical name is used so duplicates can't collide.
    """
    lookup = {syn: canonical for canonical, syns in COLUMN_SYNONYMS.items() for syn in syns}
    mapping: Dict[str, str] = {}
    for col in df.columns:
        if str(col).startswith("_"):  # internal bookkeeping columns
            continue
        canonical = lookup.get(normalise_header(col))
        if canonical and canonical not in mapping:
            mapping[canonical] = col
    renamed = df.rename(columns={original: canonical for canonical, original in mapping.items()})
    return renamed, mapping


def apply_standard_column_mapping(df: pd.DataFrame) -> pd.DataFrame:
    """Backwards-compatible wrapper returning only the renamed frame."""
    return map_columns(df)[0]


def column_warnings(columns: List[str], mapping: Dict[str, str]) -> List[str]:
    """Human-readable warnings about headers SAGE could not recognise."""
    shown = ", ".join(str(c) for c in columns if not str(c).startswith("_")) or "none"
    warnings: List[str] = []
    if "Amount" not in mapping:
        warnings.append(
            f"No amount/revenue column recognised (columns found: {shown}). "
            "Revenue will show as $0 - rename the column to e.g. 'Amount', 'Revenue' or 'Total'."
        )
    if "Date" not in mapping:
        warnings.append(
            f"No date column recognised (columns found: {shown}). "
            "Rows are dated today, so trends won't be meaningful - add a 'Date' column."
        )
    return warnings
