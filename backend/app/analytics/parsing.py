import re

import numpy as np
import pandas as pd

_CURRENCY_NOISE = re.compile(r"[^\d,.\-+()]")
_THOUSANDS_COMMA = re.compile(r"^\d{1,3}(,\d{3})+$")
_DECIMAL_COMMA = re.compile(r"^\d+,\d{1,2}$")
_THOUSANDS_DOT = re.compile(r"^\d{1,3}(\.\d{3}){2,}$")


def parse_amount(value) -> float:
    """
    Parse spreadsheet-style money into a float. Handles '$1,200.50', '1.200,50' (EU),
    '12,34,567.00' (Indian grouping), '(50.00)' negatives, 'USD 45' and plain numbers.
    Returns NaN when the value can't be read as a number.
    """
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return np.nan
    if isinstance(value, (int, float, np.integer, np.floating)) and not isinstance(value, bool):
        return float(value)

    text = str(value).strip()
    if not text:
        return np.nan

    negative = text.startswith("(") and text.endswith(")")
    text = _CURRENCY_NOISE.sub("", text).strip("()")
    if text.startswith("-") or text.endswith("-"):
        negative = True
        text = text.strip("-")
    text = text.lstrip("+")
    if not text or not re.search(r"\d", text):
        return np.nan

    if "," in text and "." in text:
        # The separator that appears last is the decimal point.
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
    elif "," in text:
        if _THOUSANDS_COMMA.match(text):
            text = text.replace(",", "")
        elif _DECIMAL_COMMA.match(text):
            text = text.replace(",", ".")
        else:
            text = text.replace(",", "")
    elif _THOUSANDS_DOT.match(text):
        text = text.replace(".", "")

    try:
        number = float(text)
    except ValueError:
        return np.nan
    return -number if negative else number


def parse_amount_series(series: pd.Series) -> pd.Series:
    if pd.api.types.is_numeric_dtype(series):
        return pd.to_numeric(series, errors="coerce")
    return series.map(parse_amount).astype(float)
