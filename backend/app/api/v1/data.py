from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import pandas as pd

from app.core.db import get_db
from app.api.deps import get_current_user, get_workspace_owner_id
from app.models.user import User
from app.models.synced_data import SyncedData
from app.models.computed_stat import ComputedStat
from app.analytics.profiler import run_profiling

router = APIRouter()

@router.get("/")
def get_synced_data(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve raw synced transaction data records for the authenticated user."""
    owner_id = get_workspace_owner_id(current_user)
    records = db.query(SyncedData).filter(SyncedData.user_id == owner_id).all()
    return {
        "count": len(records),
        "data": [r.raw_payload for r in records[:100]]  # limit output for performance
    }


@router.post("/profile", status_code=status.HTTP_201_CREATED)
def trigger_profiling(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Run the deterministic profiling layer on all user synced data.
    Saves and returns the output statistics.
    """
    owner_id = get_workspace_owner_id(current_user)
    records = db.query(SyncedData).filter(SyncedData.user_id == owner_id).all()
    if not records:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No synchronized data records found. Please connect your account and sync sheets first."
        )

    # Execute profiling engine
    profile_data = run_profiling(records)

    # Determine period start and end
    # Extract dates from records
    dates = []
    for r in records:
        # Standardize matching key case-insensitively
        payload = r.raw_payload
        for k, v in payload.items():
            if k.lower().strip() in ("date", "timestamp", "created_at", "dt"):
                parsed_dt = pd.to_datetime(v, errors="coerce")
                if pd.notna(parsed_dt):
                    dates.append(parsed_dt)

    period_start = min(dates).to_pydatetime() if dates else None
    period_end = max(dates).to_pydatetime() if dates else None

    # Save to computed_stats
    stat = ComputedStat(
        user_id=owner_id,
        metrics=profile_data,
        period_start=period_start,
        period_end=period_end
    )
    db.add(stat)
    db.commit()
    db.refresh(stat)

    return stat.metrics


@router.get("/profile/latest")
def get_latest_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve the most recent computed stats profile for the current user."""
    owner_id = get_workspace_owner_id(current_user)
    stat = db.query(ComputedStat).filter(
        ComputedStat.user_id == owner_id
    ).order_by(ComputedStat.created_at.desc()).first()

    if not stat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No profiling stats found. Please run '/api/v1/data/profile' first."
        )

    return stat.metrics
