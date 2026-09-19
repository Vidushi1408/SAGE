from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.api.deps import get_current_user, get_workspace_owner_id, require_writer
from app.models.user import User
from app.models.computed_stat import ComputedStat
from app.models.insight import Insight
from app.services.ai import AIService

router = APIRouter()


@router.post("/generate", status_code=status.HTTP_201_CREATED)
def generate_insights(
    current_user: User = Depends(require_writer),
    db: Session = Depends(get_db)
):
    """
    Generate plain-English insights from the latest computed stats.
    Saves and returns the output insight record.
    """
    owner_id = get_workspace_owner_id(current_user)
    from app.services.sync_service import generate_user_insights
    return generate_user_insights(db, owner_id)


@router.get("/latest")
def get_latest_insight(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve the most recent AI-generated insights for the current user."""
    owner_id = get_workspace_owner_id(current_user)
    latest_insight = db.query(Insight).filter(
        Insight.user_id == owner_id
    ).order_by(Insight.created_at.desc()).first()

    if not latest_insight:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No insights generated yet. Please run '/api/v1/insights/generate' first."
        )

    return latest_insight


@router.get("/history")
def get_insight_history(
    limit: int = Query(default=10, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List past insight generations (summary only) for the insight-history selector."""
    owner_id = get_workspace_owner_id(current_user)
    records = db.query(Insight).filter(
        Insight.user_id == owner_id
    ).order_by(Insight.created_at.desc()).limit(limit).all()

    return [
        {
            "id": r.id,
            "created_at": r.created_at,
            "recommendation": r.insight_data.get("recommendation") if r.insight_data else None
        }
        for r in records
    ]


@router.get("/{insight_id}")
def get_insight_by_id(
    insight_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve a specific past insight, paired with the stats snapshot it was generated from."""
    owner_id = get_workspace_owner_id(current_user)
    insight = db.query(Insight).filter(
        Insight.id == insight_id,
        Insight.user_id == owner_id
    ).first()

    if not insight:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Insight not found.")

    return {
        "id": insight.id,
        "created_at": insight.created_at,
        "insight_data": insight.insight_data,
        "computed_stats": insight.computed_stat.metrics if insight.computed_stat else None
    }
