import pandas as pd
import numpy as np
from typing import List, Dict, Any, Tuple
from datetime import datetime
from app.models.synced_data import SyncedData
from app.analytics.column_mapping import map_columns, column_warnings
from app.analytics.parsing import parse_amount_series

def clean_val(val: Any) -> Any:
    """Helper to convert NumPy types/NaNs to standard Python JSON-serializable types."""
    if pd.isna(val) or (isinstance(val, float) and np.isinf(val)) or (isinstance(val, float) and np.isnan(val)):
        return None
    if isinstance(val, (np.integer, int)):
        return int(val)
    if isinstance(val, (np.floating, float)):
        return round(float(val), 2)
    return val

def clean_record_dict(d: Dict[str, Any]) -> Dict[str, Any]:
    """Recursively clean dict keys and values."""
    return {k: clean_val(v) for k, v in d.items()}

DRIVER_DAILY_WINDOW = 60  # keep the stored per-day breakdown small


def _driver_breakdown(df: pd.DataFrame, dim: str) -> Dict[str, List[Dict[str, Any]]]:
    """Revenue/transactions per period per value of `dim`; lets chat explain *why* a period moved."""
    if dim not in df.columns:
        return {"daily": [], "weekly": [], "monthly": []}
    work = df[["Date", "Amount", dim]].copy()
    work[dim] = work[dim].fillna("Unknown").astype(str)
    labels = {
        "daily": work["Date"].dt.date.astype(str),
        "weekly": work["Date"].dt.to_period("W").astype(str),
        "monthly": work["Date"].dt.to_period("M").astype(str),
    }
    out: Dict[str, List[Dict[str, Any]]] = {}
    for granularity, label in labels.items():
        grp = work.assign(period=label).groupby(["period", dim]).agg(
            revenue=("Amount", "sum"), transactions=("Amount", "count")
        ).reset_index().sort_values("period")
        if granularity == "daily":
            keep = sorted(grp["period"].unique())[-DRIVER_DAILY_WINDOW:]
            grp = grp[grp["period"].isin(keep)]
        out[granularity] = [
            {"period": r["period"], "name": r[dim],
             "revenue": round(float(r["revenue"]), 2), "transactions": int(r["transactions"])}
            for _, r in grp.iterrows()
        ]
    return out


def run_profiling(records: List[SyncedData]) -> Dict[str, Any]:
    """
    Given a list of SyncedData records, load into a pandas DataFrame,
    perform deterministic analysis, and return a dictionary of statistics.
    """
    if not records:
        return {
            "summary": {"total_revenue": 0, "total_transactions": 0, "avg_transaction_value": 0},
            "period_metrics": {"daily": [], "monthly": [], "weekly": []},
            "category_metrics": {"top_categories": [], "bottom_categories": [], "all_categories": []},
            "payment_breakdown": [],
            "quantity_breakdown": [],
            "amount_distribution": [],
            "anomalies": [],
            "correlations": {},
            "data_quality": {"rows_total": 0, "rows_used": 0, "mapped_columns": {}, "warnings": []}
        }

    # Extract dict payloads
    raw_payloads = []
    for r in records:
        payload = dict(r.raw_payload)
        # Store original database details for reference inside profiler
        payload["_db_id"] = str(r.id)
        payload["_external_id"] = r.external_id
        raw_payloads.append(payload)

    df = pd.DataFrame(raw_payloads)

    # 1. Standardize columns case-insensitively
    original_columns = [c for c in df.columns if not str(c).startswith("_")]
    df, mapped_columns = map_columns(df)
    warnings = column_warnings(original_columns, mapped_columns)
    rows_total = int(df.shape[0])

    # Ensure critical fields exist, or create empty defaults
    if "Date" not in df.columns:
        df["Date"] = pd.Timestamp.utcnow().date()
    if "Amount" not in df.columns:
        df["Amount"] = 0.0
    if "Quantity" not in df.columns:
        df["Quantity"] = 1

    # Coerce data types
    raw_amount = df["Amount"]
    df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
    df["Amount"] = parse_amount_series(df["Amount"])
    unreadable_amounts = int((df["Amount"].isna() & raw_amount.notna() & (raw_amount.astype(str).str.strip() != "")).sum())
    if unreadable_amounts:
        example = raw_amount[df["Amount"].isna() & raw_amount.notna()].iloc[0]
        warnings.append(
            f"{unreadable_amounts} of {rows_total} rows have an Amount that could not be read as a number "
            f"(e.g. '{example}'); they are counted as 0."
        )
    df["Amount"] = df["Amount"].fillna(0.0)
    df["Quantity"] = pd.to_numeric(df["Quantity"], errors="coerce").fillna(1)

    # Drop rows with critical formatting failures (e.g. invalid dates)
    bad_dates = int(df["Date"].isna().sum())
    if bad_dates and "Date" in mapped_columns:
        warnings.append(f"{bad_dates} of {rows_total} rows were dropped because their date could not be read.")
    df = df.dropna(subset=["Date"])
    df = df.sort_values(by="Date").reset_index(drop=True)

    data_quality = {
        "rows_total": rows_total,
        "rows_used": int(df.shape[0]),
        "mapped_columns": mapped_columns,
        "warnings": warnings,
    }

    if df.empty:
        return {
            "summary": {"total_revenue": 0, "total_transactions": 0, "avg_transaction_value": 0},
            "period_metrics": {"daily": [], "monthly": [], "weekly": []},
            "category_metrics": {"top_categories": [], "bottom_categories": [], "all_categories": []},
            "payment_breakdown": [],
            "quantity_breakdown": [],
            "amount_distribution": [],
            "anomalies": [],
            "correlations": {},
            "data_quality": data_quality
        }

    # --- Calculations ---

    # 2. General Summary
    total_rev = float(df["Amount"].sum())
    total_tx = int(df.shape[0])
    avg_tx = float(df["Amount"].mean()) if total_tx > 0 else 0.0

    summary = {
        "total_revenue": round(total_rev, 2),
        "total_transactions": total_tx,
        "avg_transaction_value": round(avg_tx, 2)
    }

    # 3. Monthly Metrics & MoM Growth
    monthly_list = []
    # Make a copy for manipulation
    m_df = df.copy()
    m_df["YearMonth"] = m_df["Date"].dt.to_period("M")
    monthly_grp = m_df.groupby("YearMonth").agg(
        revenue=("Amount", "sum"),
        transactions=("Amount", "count")
    ).sort_index().reset_index()

    if not monthly_grp.empty:
        # Calculate MoM pct change
        monthly_grp["growth_pct"] = monthly_grp["revenue"].pct_change() * 100
        monthly_grp["month"] = monthly_grp["YearMonth"].astype(str)
        
        for _, row in monthly_grp.iterrows():
            monthly_list.append({
                "month": str(row["month"]),
                "revenue": round(float(row["revenue"]), 2),
                "transactions": int(row["transactions"]),
                "growth_pct": clean_val(row["growth_pct"])
            })

    # 3b. Daily Metrics & DoD Growth (powers date-specific chat questions, e.g. "why did sales drop on X")
    daily_list = []
    d_df = df.copy()
    d_df["Day"] = d_df["Date"].dt.date
    daily_grp = d_df.groupby("Day").agg(
        revenue=("Amount", "sum"),
        transactions=("Amount", "count")
    ).sort_index().reset_index()

    if not daily_grp.empty:
        daily_grp["growth_pct"] = daily_grp["revenue"].pct_change() * 100

        for _, row in daily_grp.iterrows():
            daily_list.append({
                "date": row["Day"].isoformat(),
                "revenue": round(float(row["revenue"]), 2),
                "transactions": int(row["transactions"]),
                "growth_pct": clean_val(row["growth_pct"])
            })

    # 4. Weekly Metrics & WoW Growth
    weekly_list = []
    w_df = df.copy()
    w_df["YearWeek"] = w_df["Date"].dt.to_period("W")
    weekly_grp = w_df.groupby("YearWeek").agg(
        revenue=("Amount", "sum"),
        transactions=("Amount", "count")
    ).sort_index().reset_index()

    if not weekly_grp.empty:
        # Calculate WoW pct change
        weekly_grp["growth_pct"] = weekly_grp["revenue"].pct_change() * 100
        weekly_grp["week"] = weekly_grp["YearWeek"].astype(str)
        
        for _, row in weekly_grp.iterrows():
            weekly_list.append({
                "week": str(row["week"]),
                "revenue": round(float(row["revenue"]), 2),
                "transactions": int(row["transactions"]),
                "growth_pct": clean_val(row["growth_pct"])
            })

    # 5. Category Analysis
    top_categories = []
    bottom_categories = []
    all_categories = []

    if "Category" in df.columns:
        cat_grp = df.groupby("Category").agg(
            revenue=("Amount", "sum"),
            volume=("Amount", "count")
        ).reset_index()
        
        total_cat_rev = cat_grp["revenue"].sum()
        if total_cat_rev > 0:
            cat_grp["share_pct"] = (cat_grp["revenue"] / total_cat_rev) * 100
        else:
            cat_grp["share_pct"] = 0.0
            
        cat_grp = cat_grp.sort_values(by="revenue", ascending=False).reset_index(drop=True)
        
        # Clean categories
        categories_cleaned = []
        for _, row in cat_grp.iterrows():
            categories_cleaned.append({
                "category": str(row["Category"]),
                "revenue": round(float(row["revenue"]), 2),
                "volume": int(row["volume"]),
                "share_pct": round(float(row["share_pct"]), 2)
            })
            
        top_categories = categories_cleaned[:3]
        bottom_categories = categories_cleaned[-3:] if len(categories_cleaned) > 3 else categories_cleaned
        all_categories = categories_cleaned

    # 5b. Payment method breakdown (only present when the source data has a recognisable column)
    payment_breakdown = []
    if "Payment Method" in df.columns:
        pay_grp = df.groupby("Payment Method").agg(
            revenue=("Amount", "sum"),
            volume=("Amount", "count")
        ).reset_index()
        total_pay_rev = pay_grp["revenue"].sum()
        pay_grp["share_pct"] = (pay_grp["revenue"] / total_pay_rev * 100) if total_pay_rev > 0 else 0.0
        pay_grp = pay_grp.sort_values(by="revenue", ascending=False).reset_index(drop=True)
        for _, row in pay_grp.iterrows():
            payment_breakdown.append({
                "method": str(row["Payment Method"]),
                "revenue": round(float(row["revenue"]), 2),
                "volume": int(row["volume"]),
                "share_pct": round(float(row["share_pct"]), 2)
            })

    # 5c. Revenue by quantity-per-order (full dataset, not a capped sample)
    quantity_breakdown = []
    if "Quantity" in df.columns:
        qty_grp = df.groupby("Quantity").agg(
            avg_amount=("Amount", "mean"),
            count=("Amount", "count")
        ).reset_index().sort_values(by="Quantity")
        for _, row in qty_grp.iterrows():
            quantity_breakdown.append({
                "quantity": clean_val(row["Quantity"]),
                "avg_amount": round(float(row["avg_amount"]), 2),
                "count": int(row["count"])
            })

    # 5d. Transaction amount distribution (histogram over the full dataset; refunds bucketed separately)
    amount_distribution = []
    positive_amounts = df.loc[df["Amount"] > 0, "Amount"]
    refund_count = int((df["Amount"] < 0).sum())
    if not positive_amounts.empty:
        max_amt = float(positive_amounts.max())
        bin_count = min(8, max(1, positive_amounts.nunique()))
        try:
            counts, edges = np.histogram(positive_amounts, bins=bin_count)
            for i in range(len(counts)):
                if counts[i] == 0:
                    continue
                lo, hi = edges[i], edges[i + 1]
                amount_distribution.append({
                    "range": f"${lo:,.0f}-{hi:,.0f}",
                    "count": int(counts[i])
                })
        except ValueError:
            pass
    if refund_count:
        amount_distribution.append({"range": "Refunds (<$0)", "count": refund_count})

    # 6. Anomaly Detection (Z-score, IQR & negative values)
    anomalies = []
    mean_amount = df["Amount"].mean()
    std_amount = df["Amount"].std()
    
    # Calculate Z-score
    df["z_score"] = 0.0
    if pd.notna(std_amount) and std_amount > 0:
        df["z_score"] = (df["Amount"] - mean_amount) / std_amount

    # Calculate IQR boundaries
    q1 = df["Amount"].quantile(0.25)
    q3 = df["Amount"].quantile(0.75)
    iqr = q3 - q1
    lower_bound = q1 - 1.5 * iqr
    upper_bound = q3 + 1.5 * iqr

    for idx, row in df.iterrows():
        is_z_outlier = abs(row["z_score"]) > 2.5
        # IQR fences alone flag ordinary sales in bimodal data (e.g. weekend vs weekday prices),
        # so an IQR outlier must also sit meaningfully far from the mean (|z| > 1).
        is_iqr_outlier = ((row["Amount"] < lower_bound) or (row["Amount"] > upper_bound)) and abs(row["z_score"]) > 1.0
        is_negative = row["Amount"] < 0
        
        # Consider a row anomalous if it is a negative value (refund), a Z-score outlier, OR an IQR outlier
        if is_negative or is_z_outlier or is_iqr_outlier:
            if is_negative:
                reason = "Refund/Chargeback transaction"
            elif row["Amount"] > upper_bound or row["z_score"] > 2.5:
                reason = "High value outlier order"
            else:
                reason = "Low value outlier"
                
            tx_id = row.get("Transaction ID", row.get("_external_id", f"row_{idx}"))
            anomalies.append({
                "transaction_id": str(tx_id),
                "date": row["Date"].strftime("%Y-%m-%d"),
                "amount": round(float(row["Amount"]), 2),
                "z_score": round(float(row["z_score"]), 2) if pd.notna(row["z_score"]) else 0.0,
                "reason": reason
            })

    # 7. Correlations
    correlations = {}
    if "Quantity" in df.columns and df["Quantity"].nunique() > 1 and df["Amount"].nunique() > 1:
        corr_coef = df["Amount"].corr(df["Quantity"])
        correlations["amount_vs_quantity"] = clean_val(corr_coef)

    # Compile profile
    profile = {
        "summary": summary,
        "period_metrics": {
            "daily": daily_list,
            "monthly": monthly_list,
            "weekly": weekly_list
        },
        "category_metrics": {
            "top_categories": top_categories,
            "bottom_categories": bottom_categories,
            "all_categories": all_categories
        },
        "payment_breakdown": payment_breakdown,
        "quantity_breakdown": quantity_breakdown,
        "amount_distribution": amount_distribution,
        "anomalies": anomalies,
        "correlations": correlations,
        "drivers": {
            "category": _driver_breakdown(df, "Category"),
            "payment_method": _driver_breakdown(df, "Payment Method"),
        },
        "data_quality": data_quality
    }

    return profile
