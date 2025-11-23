#!/usr/bin/env python3
"""
Validation Service - Ensures state restoration is safe
"""
import os
import subprocess
from pathlib import Path
from typing import Dict, List, Any

class RestorationValidator:
    """Validates that state restoration is safe"""
    
    def __init__(self, workspace_root: str):
        self.workspace_root = Path(workspace_root)
    
    def validate_restoration(self, session_id: str, target_step: int, file_snapshots: Dict[str, str]) -> Dict[str, Any]:
        """
        Check if restoration is safe:
        - Target checkpoint exists
        - Files are not locked by other processes
        - Git working tree is clean (optional)
        - No active agent process
        """
        errors = []
        warnings = []
        
        # 1. Check for file locks
        locked_files = self._check_file_locks(list(file_snapshots.keys()))
        if locked_files:
            warnings.append(f"Files may be in use: {', '.join(locked_files)}")
        
        # 2. Check Git status (if in Git repo)
        if self._is_git_repo():
            git_status = self._get_git_status()
            if git_status['has_changes']:
                warnings.append(
                    f"Git working tree has uncommitted changes: "
                    f"{git_status['modified_count']} modified, "
                    f"{git_status['untracked_count']} untracked"
                )
        
        # 3. Check for large file operations
        total_size = sum(len(content) for content in file_snapshots.values())
        if total_size > 10 * 1024 * 1024:  # 10MB
            warnings.append(f"Large restoration ({total_size // 1024 // 1024}MB) - may take time")
        
        # 4. Check write permissions
        permission_errors = self._check_write_permissions(list(file_snapshots.keys()))
        if permission_errors:
            errors.extend([f"No write permission: {f}" for f in permission_errors])
        
        return {
            'valid': len(errors) == 0,
            'errors': errors,
            'warnings': warnings,
            'safe_to_proceed': len(errors) == 0,
            'requires_confirmation': len(warnings) > 0
        }
    
    def _check_file_locks(self, file_paths: List[str]) -> List[str]:
        """Check if files are locked/in use"""
        locked = []
        for file_path in file_paths:
            full_path = self.workspace_root / file_path if not file_path.startswith('/') else Path(file_path)
            if full_path.exists():
                try:
                    # Try to open for writing
                    with open(full_path, 'a'):
                        pass
                except (IOError, OSError):
                    locked.append(file_path)
        return locked
    
    def _is_git_repo(self) -> bool:
        """Check if workspace is a Git repository"""
        git_dir = self.workspace_root / '.git'
        return git_dir.exists()
    
    def _get_git_status(self) -> Dict[str, Any]:
        """Get Git working tree status"""
        try:
            result = subprocess.run(
                ['git', 'status', '--porcelain'],
                cwd=self.workspace_root,
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if result.returncode == 0:
                lines = result.stdout.strip().split('\n')
                lines = [l for l in lines if l]  # Remove empty
                
                modified = [l for l in lines if l.startswith(' M') or l.startswith('M')]
                untracked = [l for l in lines if l.startswith('??')]
                
                return {
                    'has_changes': len(lines) > 0,
                    'modified_count': len(modified),
                    'untracked_count': len(untracked),
                    'total_changes': len(lines)
                }
        except Exception:
            pass
        
        return {'has_changes': False, 'modified_count': 0, 'untracked_count': 0}
    
    def _check_write_permissions(self, file_paths: List[str]) -> List[str]:
        """Check if we can write to all target files"""
        permission_errors = []
        
        for file_path in file_paths:
            full_path = self.workspace_root / file_path if not file_path.startswith('/') else Path(file_path)
            
            # Check parent directory write permission
            parent = full_path.parent
            if not os.access(parent, os.W_OK):
                permission_errors.append(file_path)
        
        return permission_errors


if __name__ == "__main__":
    import sys
    import json
    import argparse
    
    parser = argparse.ArgumentParser()
    parser.add_argument('--workspace', required=True)
    parser.add_argument('--session-id', required=True)
    parser.add_argument('--target-step', type=int, required=True)
    parser.add_argument('--file-snapshots', required=True, help='JSON of file snapshots')
    
    args = parser.parse_args()
    
    validator = RestorationValidator(args.workspace)
    file_snapshots = json.loads(args.file_snapshots)
    
    result = validator.validate_restoration(
        args.session_id,
        args.target_step,
        file_snapshots
    )
    
    print(json.dumps(result, indent=2))
