import logging
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import Session
from uuid import UUID

from app.core.db import SessionLocal
from app.core.config import settings
from app.models.connected_account import ConnectedAccount
from app.services.sync_service import sync_account_sheets, profile_user_data, generate_user_insights

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sage_scheduler")

class SchedulerService:
    def __init__(self):
        self.scheduler = BackgroundScheduler()
        self.running = False

    def start(self):
        """Start the background scheduler interval jobs."""
        if self.running:
            logger.info("Scheduler is already running.")
            return

        interval = settings.SYNC_INTERVAL_MINUTES
        logger.info(f"Starting SAGE Background Scheduler. Interval: {interval} minutes.")
        
        # Add recurring sync job
        self.scheduler.add_job(
            func=self.run_scheduled_sync_pipeline,
            trigger="interval",
            minutes=interval,
            id="sage_sync_job",
            replace_existing=True
        )
        
        self.scheduler.start()
        self.running = True
        logger.info("SAGE Background Scheduler started successfully.")

    def shutdown(self):
        """Stop the background scheduler cleanly."""
        if not self.running:
            logger.info("Scheduler is not running.")
            return

        logger.info("Shutting down SAGE Background Scheduler...")
        self.scheduler.shutdown(wait=False)
        self.running = False
        logger.info("SAGE Background Scheduler stopped.")

    def run_scheduled_sync_pipeline(self, db: Session = None):
        """Execute the ingestion, profiling, and insights pipeline for all connected accounts."""
        logger.info("Starting background synchronization pipeline run...")
        own_db = False
        if db is None:
            db = SessionLocal()
            own_db = True
        
        try:
            # Find all active Google Sheets connections
            accounts = db.query(ConnectedAccount).filter(
                ConnectedAccount.service == "google_sheets"
            ).all()

            logger.info(f"Found {len(accounts)} connected Google Sheets account(s) to process.")

            for account in accounts:
                metadata = account.account_metadata or {}
                spreadsheet_id = metadata.get("connected_spreadsheet_id")
                sheet_name = metadata.get("connected_sheet_name")

                if not spreadsheet_id or not sheet_name:
                    logger.info(f"Skipping account {account.id}: No spreadsheet/sheet configuration found in metadata.")
                    continue

                logger.info(f"Processing background sync for account {account.id} (Owner: {account.user_id}).")
                
                try:
                    # 1. Sync Sheets Data Ingestion
                    rows_synced = sync_account_sheets(db, account, spreadsheet_id, sheet_name)
                    logger.info(f"Ingested {rows_synced} rows for account {account.id}.")

                    # 2. Run Local Pandas Statistical Profiling
                    profile_user_data(db, account.user_id)
                    logger.info(f"Pandas metrics profiling updated for owner {account.user_id}.")

                    # 3. Generate AI Claude Insights & Prescriptive Recommendations
                    generate_user_insights(db, account.user_id)
                    logger.info(f"Claude AI insights recompiled for owner {account.user_id}.")

                    logger.info(f"Successfully completed background pipeline execution for account {account.id}.")
                
                except Exception as ex:
                    logger.error(f"Error executing pipeline for account {account.id}: {ex}", exc_info=True)

        except Exception as e:
            logger.error(f"Error querying connected accounts: {e}", exc_info=True)
        
        finally:
            if own_db:
                db.close()
            logger.info("Completed background synchronization pipeline run.")

# Singleton service instance
scheduler_service = SchedulerService()
