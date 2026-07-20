import pandas as pd
import numpy as np
from typing import List, Dict, Any, Tuple
from datetime import datetime
from app.models.synced_data import SyncedData

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

def run_profiling(records: List[SyncedData]) -> Dict[str, Any]:
    """
    Given a list of SyncedData records, load into a pandas DataFrame,
    perform deterministic analysis, and return a dictionary of statistics.
    """
    if not records:
        return {
            "summary": {"total_revenue": 0, "total_transactions": 0, "avg_transaction_value": 0},
            "period_metrics": {"monthly": [], "weekly": []},
            "category_metrics": {"top_categories": [], "bottom_categories": []},
            "anomalies": [],
            "correlations": {}
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
    column_mapping = {}
    for col in df.columns:
        col_lower = col.lower().strip()
        if col_lower in ("date", "timestamp", "created_at", "dt"):
            column_mapping[col] = "Date"
        elif col_lower in ("amount", "sales", "value", "price", "revenue"):
            column_mapping[col] = "Amount"
        elif col_lower in ("category", "type", "dept", "department"):
            column_mapping[col] = "Category"
        elif col_lower in ("quantity", "qty", "count", "units"):
            column_mapping[col] = "Quantity"
            
    df = df.rename(columns=column_mapping)

    # Ensure critical fields exist, or create empty defaults
    if "Date" not in df.columns:
        df["Date"] = pd.Timestamp.utcnow().date()
    if "Amount" not in df.columns:
        df["Amount"] = 0.0
    if "Quantity" not in df.columns:
        df["Quantity"] = 1

    # Coerce data types
    df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
    df["Amount"] = pd.to_numeric(df["Amount"], errors="coerce").fillna(0.0)
    df["Quantity"] = pd.to_numeric(df["Quantity"], errors="coerce").fillna(1)

    # Drop rows with critical formatting failures (e.g. invalid dates)
    df = df.dropna(subset=["Date"])
    df = df.sort_values(by="Date").reset_index(drop=True)

    if df.empty:
        return {
            "summary": {"total_revenue": 0, "total_transactions": 0, "avg_transaction_value": 0},
            "period_metrics": {"monthly": [], "weekly": []},
            "category_metrics": {"top_categories": [], "bottom_categories": []},
            "anomalies": [],
            "correlations": {}
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
        is_iqr_outlier = (row["Amount"] < lower_bound) or (row["Amount"] > upper_bound)
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
            "monthly": monthly_list,
            "weekly": weekly_list
        },
        "category_metrics": {
            "top_categories": top_categories,
            "bottom_categories": bottom_categories
        },
        "anomalies": anomalies,
        "correlations": correlations
    }

    return profile
