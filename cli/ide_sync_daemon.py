#!/usr/bin/env python3
"""
IDE State Sync Daemon - Polls for checkpoint changes and syncs workspace
"""
import os
from langgraph.checkpoint.sqlite import SqliteSaver
import sys
import time
import json
import sqlite3
import shutil
from pathlib import Path
from datetime import datetime
from typing import Dict, Optional

class IDEStateSyncDaemon:
    """
    Polls SQLite checkpoints and syncs workspace files when rollback/branch detected.
    Monitors .mindmap_session metadata to detect external state changes.
    """
    
    def __init__(self, workspace_path: str, db_path: str, poll_interval: int = 5):
        self.workspace = Path(workspace_path)
        self.db_path = db_path
        self.poll_interval = poll_interval
        self.session_file = self.workspace / '.mindmap_session'
        self.backup_dir = self.workspace / '.backup'
        self.log_file = self.workspace / 'mindmap.log'
        
        # Create directories
        self.backup_dir.mkdir(exist_ok=True)
        
        # Initialize session tracking
        self.current_session_id = None
        self.current_checkpoint_id = None
        self.load_session_state()
    
    def load_session_state(self):
        """Load last known session/checkpoint from .mindmap_session"""
        if self.session_file.exists():
            try:
                with open(self.session_file, 'r') as f:
                    data = json.load(f)
                    self.current_session_id = data.get('session_id')
                    self.current_checkpoint_id = data.get('checkpoint_id')
                    print(f"📖 Loaded session state: {self.current_session_id} @ checkpoint {self.current_checkpoint_id}")
            except Exception as e:
                print(f"⚠️  Error loading session state: {e}")
    
    def save_session_state(self, session_id: str, checkpoint_id: int):
        """Save current session/checkpoint to .mindmap_session"""
        data = {
            'session_id': session_id,
            'checkpoint_id': checkpoint_id,
            'last_updated': datetime.now().isoformat()
        }
        with open(self.session_file, 'w') as f:
            json.dump(data, f, indent=2)
        
        self.current_session_id = session_id
        self.current_checkpoint_id = checkpoint_id
    
    def get_latest_checkpoint(self, session_id: str) -> Optional[Dict]:
        """Query SQLite for latest checkpoint in session using LangGraph SqliteSaver"""
        try:
            # First get the latest checkpoint_id for the thread
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT checkpoint_id, checkpoint_ns
                FROM checkpoints
                WHERE thread_id = ?
                ORDER BY checkpoint_ns DESC
                LIMIT 1
                """,
                (session_id,)
            )
            row = cursor.fetchone()
            conn.close()
            if not row:
                return None
            latest_id = row[0]
            # Use LangGraph SqliteSaver to load the checkpoint
            saver = SqliteSaver(self.db_path)
            checkpoint = saver.load_checkpoint(thread_id=session_id, checkpoint_id=latest_id)
            # checkpoint.get_state() returns a dict with 'values' etc.
            checkpoint_data = checkpoint.get_state()
            return {
                'data': checkpoint_data,
                'checkpoint_id': latest_id,
                'timestamp': row[1]
            }
        except Exception as e:
            print(f"❌ Error querying checkpoint via SqliteSaver: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    def check_for_state_change(self) -> Optional[Dict]:
        """
        Check if checkpoint has changed externally.
        Returns change info if detected, None otherwise.
        """
        # Default to main-thread if no session set
        check_session = self.current_session_id or 'main-thread'
        
        latest = self.get_latest_checkpoint(check_session)
        if not latest:
            return None
        
        latest_checkpoint_id = latest['checkpoint_id']
        latest_step = latest['data'].get('values', {}).get('current_step', 0)
        
        # Detect change
        if self.current_checkpoint_id is None:
            # First run - initialize
            print(f"🎯 Initializing to checkpoint {latest_checkpoint_id} (step {latest_step})")
            return {
                'type': 'init',
                'session_id': check_session,
                'checkpoint': latest
            }
        elif latest_checkpoint_id != self.current_checkpoint_id:
            # Checkpoint changed!
            print(f"🔄 State change detected: {self.current_checkpoint_id} → {latest_checkpoint_id}")
            
            # Determine if rollback or forward
            if latest_step < (self.current_checkpoint_id or 0):
                change_type = 'rollback'
            else:
                change_type = 'forward'
            
            return {
                'type': change_type,
                'session_id': check_session,
                'checkpoint': latest,
                'previous_checkpoint_id': self.current_checkpoint_id
            }
        
        return None
    
    def restore_files(self, checkpoint_data: Dict):
        """
        Restore workspace files from checkpoint snapshot.
        Creates backups before overwriting.
        """
        file_snapshots = checkpoint_data.get('values', {}).get('file_snapshots', {})
        
        if not file_snapshots:
            print("ℹ️  No file snapshots in checkpoint")
            return
        
        restored_files = []
        removed_files = []
        
        # Backup timestamp
        backup_ts = datetime.now().strftime('%Y%m%d_%H%M%S')
        
        print(f"📁 Restoring {len(file_snapshots)} files...")
        
        for file_path, content in file_snapshots.items():
            try:
                # Full path
                full_path = self.workspace / file_path if not file_path.startswith('/') else Path(file_path)
                
                # Backup current version if exists
                if full_path.exists():
                    backup_path = self.backup_dir / f"{backup_ts}_{full_path.name}"
                    shutil.copy2(full_path, backup_path)
                    print(f"  💾 Backed up: {file_path}")
                
                # Write new content
                full_path.parent.mkdir(parents=True, exist_ok=True)
                full_path.write_text(content)
                restored_files.append(file_path)
                print(f"  ✓ Restored: {file_path}")
                
            except Exception as e:
                print(f"  ❌ Error restoring {file_path}: {e}")
        
        return restored_files, removed_files
    
    def log_restoration(self, change_type: str, session_id: str, checkpoint_id: int, files_updated: list, files_removed: list):
        """Append restoration event to mindmap.log"""
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        log_entry = f"""
{timestamp} - {change_type.upper()} - Session: {session_id}, Checkpoint: {checkpoint_id}
Files updated: {files_updated}
Files removed: {files_removed}
{'='*80}
"""
        
        with open(self.log_file, 'a') as f:
            f.write(log_entry)
        
        print(f"📝 Logged restoration to {self.log_file}")
    
    def run(self):
        """Main polling loop"""
        print(f"""
╔══════════════════════════════════════════════════════════╗
║  🔄 IDE State Sync Daemon                                ║
║  Workspace: {self.workspace.name:<40} ║
║  Poll Interval: {self.poll_interval}s{' '*39} ║
╚══════════════════════════════════════════════════════════╝
        """)
        
        print(f"👀 Monitoring for checkpoint changes...")
        
        try:
            while True:
                # Check for state change
                change = self.check_for_state_change()
                
                if change:
                    print(f"\n{'='*60}")
                    print(f"🎯 Change detected: {change['type']}")
                    print(f"{'='*60}\n")
                    
                    checkpoint = change['checkpoint']
                    
                    # Restore files
                    files_updated, files_removed = self.restore_files(checkpoint['data'])
                    
                    # Update session state
                    self.save_session_state(
                        change['session_id'],
                        checkpoint['checkpoint_id']
                    )
                    
                    # Log event
                    self.log_restoration(
                        change['type'],
                        change['session_id'],
                        checkpoint['checkpoint_id'],
                        files_updated,
                        files_removed
                    )
                    
                    print(f"\n✅ Synchronization complete!\n")
                else:
                    # No change
                    print(f".", end="", flush=True)
                
                # Sleep until next poll
                time.sleep(self.poll_interval)
                
        except KeyboardInterrupt:
            print(f"\n\n⏹️  Daemon stopped by user")
        except Exception as e:
            print(f"\n\n❌ Daemon error: {e}")
            import traceback
            traceback.print_exc()


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='IDE State Sync Daemon')
    parser.add_argument('--workspace', required=True, help='Path to workspace')
    parser.add_argument('--db', required=True, help='Path to SQLite database')
    parser.add_argument('--interval', type=int, default=5, help='Poll interval in seconds')
    
    args = parser.parse_args()
    
    daemon = IDEStateSyncDaemon(args.workspace, args.db, args.interval)
    daemon.run()
