from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session
import pandas as pd

from app.core.db import get_db
from app.api.deps import forbid_demo, get_current_user, get_workspace_owner_id, require_writer
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


@router.get("/export")
def export_my_data(current_user: User = Depends(forbid_demo), db: Session = Depends(get_db)):
    """Download everything SAGE holds for this workspace as a ZIP of CSV/JSON files (no credentials or tokens)."""
    from app.services.account_export import build_export
    return Response(
        content=build_export(db, current_user),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="sage-export.zip"'},
    )


@router.post("/profile", status_code=status.HTTP_201_CREATED)
def trigger_profiling(
    current_user: User = Depends(require_writer),
    db: Session = Depends(get_db)
):
    """
    Run the deterministic profiling layer on all user synced data.
    Saves and returns the output statistics.
    """
    owner_id = get_workspace_owner_id(current_user)
    from app.services.sync_service import profile_user_data
    return profile_user_data(db, owner_id)


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
