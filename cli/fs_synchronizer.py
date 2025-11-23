#!/usr/bin/env python3
"""
File System Synchronizer - Handles safe file restoration from checkpoint snapshots
"""
import os
import shutil
import difflib
import json
from pathlib import Path
from typing import Dict, List, Any
from datetime import datetime

class FileSystemSynchronizer:
    """Handles safe file restoration from checkpoint snapshots"""
    
    def __init__(self, workspace_root: str, backup_dir: str = ".mindmap/backups"):
        self.workspace_root = Path(workspace_root)
        self.backup_dir = self.workspace_root / backup_dir
        self.backup_dir.mkdir(parents=True, exist_ok=True)
    
    def restore_files(self, file_snapshots: Dict[str, str], backup_id: str) -> Dict[str, Any]:
        """
        Restore files from checkpoint snapshots with automatic backup.
        
        Args:
            file_snapshots: Dict of {filepath: file_content_at_checkpoint}
            backup_id: Unique ID for this restoration backup
            
        Returns:
            - files_restored: List[str]
            - files_backed_up: List[str]
            - conflicts: List[Dict] (files modified since checkpoint)
        """
        results = {
            'files_restored': [],
            'files_backed_up': [],
            'conflicts': [],
            'backup_path': str(self.backup_dir / backup_id)
        }
        
        # Create backup directory for this restoration
        backup_path = self.backup_dir / backup_id
        backup_path.mkdir(parents=True, exist_ok=True)
        
        for filepath, snapshot_content in file_snapshots.items():
            # Handle relative paths
            if not filepath.startswith('/'):
                full_path = self.workspace_root / filepath
            else:
                full_path = Path(filepath)
            
            # 1. Check if file was modified since checkpoint
            if full_path.exists():
                try:
                    current_content = full_path.read_text()
                    
                    if current_content != snapshot_content:
                        # Conflict detected - show diff
                        diff = self._generate_diff(snapshot_content, current_content, str(filepath))
                        results['conflicts'].append({
                            'file': str(filepath),
                            'diff': diff,
                            'snapshot_lines': len(snapshot_content.splitlines()),
                            'current_lines': len(current_content.splitlines())
                        })
                        
                        # Backup current version
                        backup_file = backup_path / filepath.lstrip('/')
                        backup_file.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copy2(full_path, backup_file)
                        results['files_backed_up'].append(str(filepath))
                except Exception as e:
                    print(f"Warning: Could not read {full_path}: {e}")
                    continue
            
            # 2. Restore from snapshot
            try:
                full_path.parent.mkdir(parents=True, exist_ok=True)
                full_path.write_text(snapshot_content)
                results['files_restored'].append(str(filepath))
            except Exception as e:
                print(f"Error restoring {full_path}: {e}")
        
        # Save metadata
        metadata = {
            'backup_id': backup_id,
            'timestamp': datetime.now().isoformat(),
            'files_restored': results['files_restored'],
            'conflicts': len(results['conflicts'])
        }
        (backup_path / 'metadata.json').write_text(json.dumps(metadata, indent=2))
        
        return results
    
    def _generate_diff(self, old_content: str, new_content: str, filename: str) -> str:
        """Generate unified diff between two versions"""
        old_lines = old_content.splitlines(keepends=True)
        new_lines = new_content.splitlines(keepends=True)
        diff = difflib.unified_diff(
            old_lines, new_lines,
            fromfile=f'{filename} (checkpoint)', 
            tofile=f'{filename} (current)',
            lineterm=''
        )
        return ''.join(diff)
    
    def rollback_restoration(self, backup_id: str) -> Dict[str, Any]:
        """Undo a file restoration using backup"""
        backup_path = self.backup_dir / backup_id
        
        if not backup_path.exists():
            return {'success': False, 'error': f'Backup {backup_id} not found'}
        
        restored_files = []
        
        for backup_file in backup_path.rglob('*'):
            if backup_file.is_file() and backup_file.name != 'metadata.json':
                rel_path = backup_file.relative_to(backup_path)
                original_file = self.workspace_root / rel_path
                try:
                    shutil.copy2(backup_file, original_file)
                    restored_files.append(str(rel_path))
                except Exception as e:
                    print(f"Error rolling back {original_file}: {e}")
        
        return {
            'success': True,
            'files_restored': restored_files
        }
    
    def get_diff(self, file_path: str, snapshot_content: str) -> Dict[str, Any]:
        """Get diff preview for a specific file"""
        full_path = self.workspace_root / file_path if not file_path.startswith('/') else Path(file_path)
        
        if not full_path.exists():
            return {
                'file': file_path,
                'status': 'deleted',
                'diff': None
            }
        
        try:
            current_content = full_path.read_text()
            if current_content == snapshot_content:
                return {
                    'file': file_path,
                    'status': 'unchanged',
                    'diff': None
                }
            
            diff = self._generate_diff(snapshot_content, current_content, file_path)
            return {
                'file': file_path,
                'status': 'modified',
                'diff': diff,
                'lines_added': len([line for line in diff.split('\n') if line.startswith('+') and not line.startswith('+++')]),
                'lines_removed': len([line for line in diff.split('\n') if line.startswith('-') and not line.startswith('---')])
            }
        except Exception as e:
            return {
                'file': file_path,
                'status': 'error',
                'error': str(e)
            }


if __name__ == "__main__":
    import sys
    import argparse
    
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['restore', 'rollback', 'diff'])
    parser.add_argument('--workspace', required=True)
    parser.add_argument('--file-snapshots', help='JSON string of file snapshots')
    parser.add_argument('--backup-id', help='Backup ID')
    parser.add_argument('--file-path', help='File path for diff')
    parser.add_argument('--snapshot-content', help='Snapshot content for diff')
    
    args = parser.parse_args()
    
    sync = FileSystemSynchronizer(args.workspace)
    
    if args.action == 'restore':
        if not args.file_snapshots or not args.backup_id:
            print("Error: --file-snapshots and --backup-id required for restore")
            sys.exit(1)
        
        snapshots = json.loads(args.file_snapshots)
        result = sync.restore_files(snapshots, args.backup_id)
        print(json.dumps(result, indent=2))
    
    elif args.action == 'rollback':
        if not args.backup_id:
            print("Error: --backup-id required for rollback")
            sys.exit(1)
        
        result = sync.rollback_restoration(args.backup_id)
        print(json.dumps(result, indent=2))
    
    elif args.action == 'diff':
        if not args.file_path or not args.snapshot_content:
            print("Error: --file-path and --snapshot-content required for diff")
            sys.exit(1)
        
        result = sync.get_diff(args.file_path, args.snapshot_content)
        print(json.dumps(result, indent=2))
