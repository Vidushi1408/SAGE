from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.api.deps import get_current_user, get_workspace_owner_id
from app.models.user import User
from app.models.computed_stat import ComputedStat
from app.models.insight import Insight
from app.services.ai import AIService

router = APIRouter()


@router.post("/generate", status_code=status.HTTP_201_CREATED)
def generate_insights(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generate plain-English insights from the latest computed stats.
    Saves and returns the output insight record.
    """
    owner_id = get_workspace_owner_id(current_user)
    # Fetch latest computed stats for the user
    latest_stat = db.query(ComputedStat).filter(
        ComputedStat.user_id == owner_id
    ).order_by(ComputedStat.created_at.desc()).first()

    if not latest_stat:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No computed stats found. Please profile your synced data first."
        )

    # Generate insights using AI service
    insight_payload = AIService.generate_insights(latest_stat.metrics)

    # Save to database
    insight_rec = Insight(
        user_id=owner_id,
        insight_data=insight_payload
    )
    db.add(insight_rec)
    db.commit()
    db.refresh(insight_rec)

    return insight_rec


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
