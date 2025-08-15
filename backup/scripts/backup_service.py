#!/usr/bin/env python3
"""
Backup service for Auto-Apply application
Runs scheduled backups and uploads to Google Cloud Storage
"""

import os
import sys
import time
import logging
import subprocess
from datetime import datetime, timedelta
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/app/logs/backup_service.log'),
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)

def run_backup():
    """Run the backup script"""
    try:
        logger.info("Starting scheduled backup...")
        
        # Run the backup script
        result = subprocess.run(
            ['/app/scripts/backup.sh'],
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout
        )
        
        if result.returncode == 0:
            logger.info("Backup completed successfully")
            logger.info(f"Backup output: {result.stdout}")
        else:
            logger.error(f"Backup failed with return code {result.returncode}")
            logger.error(f"Backup error: {result.stderr}")
            return False
            
    except subprocess.TimeoutExpired:
        logger.error("Backup timed out after 5 minutes")
        return False
    except Exception as e:
        logger.error(f"Unexpected error during backup: {e}")
        return False
    
    return True

def main():
    """Main backup service loop"""
    logger.info("Starting Auto-Apply backup service...")
    
    # Check required environment variables
    required_vars = [
        'GOOGLE_CLOUD_PROJECT',
        'GOOGLE_CLOUD_STORAGE_BUCKET'
    ]
    
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    if missing_vars:
        logger.error(f"Missing required environment variables: {missing_vars}")
        sys.exit(1)
    
    # Create log directory
    Path('/app/logs').mkdir(parents=True, exist_ok=True)
    
    # Get backup interval (default: 24 hours)
    backup_interval_hours = int(os.getenv('BACKUP_INTERVAL_HOURS', '24'))
    backup_interval_seconds = backup_interval_hours * 3600
    
    logger.info(f"Backup service configured with {backup_interval_hours} hour interval")
    
    # Run initial backup
    logger.info("Running initial backup...")
    run_backup()
    
    # Main loop
    while True:
        try:
            # Sleep until next backup
            logger.info(f"Sleeping for {backup_interval_hours} hours until next backup...")
            time.sleep(backup_interval_seconds)
            
            # Run backup
            success = run_backup()
            
            if not success:
                logger.warning("Backup failed, will retry at next interval")
                
        except KeyboardInterrupt:
            logger.info("Backup service stopped by user")
            break
        except Exception as e:
            logger.error(f"Unexpected error in backup service: {e}")
            time.sleep(60)  # Wait 1 minute before retrying

if __name__ == "__main__":
    main()
