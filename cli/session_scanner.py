#!/usr/bin/env python3
"""
Session Scanner - Discovers all Antigravity sessions and extracts reasoning
"""
import json
import os
import re
from pathlib import Path
from typing import List, Dict, Optional
from datetime import datetime

class SessionScanner:
    def __init__(self, brain_base_dir: str = None):
        if brain_base_dir is None:
            self.brain_dir = Path.home() / ".gemini/antigravity/brain"
        else:
            self.brain_dir = Path(brain_base_dir)
    
    def discover_sessions(self) -> List[Dict]:
        """Discover all Antigravity sessions"""
        sessions = []
        
        if not self.brain_dir.exists():
            return sessions
        
        for session_path in self.brain_dir.iterdir():
            if not session_path.is_dir():
                continue
                
            session_info = self.get_session_info(session_path)
            if session_info:
                sessions.append(session_info)
        
        # Sort by modification time, newest first
        sessions.sort(key=lambda s: s['last_modified'], reverse=True)
        return sessions
    
    def get_session_info(self, session_path: Path) -> Optional[Dict]:
        """Extract session metadata with improved project name detection"""
        task_file = session_path / 'task.md'
        plan_file = session_path / 'implementation_plan.md'
        
        # Get last modified time
        mtime = session_path.stat().st_mtime
        
        # Try to extract project info
        project_name = "Unknown Project"
        step_count = 0
        files_modified = []
        
        # Strategy 1: Look for file:// links across all artifacts
        all_paths = []
        
        for artifact_file in [plan_file, task_file]:
            if artifact_file.exists():
                try:
                    with open(artifact_file, 'r') as f:
                        content = f.read()
                        
                        # Extract from file:// protocol links
                        # Pattern: file:///path/to/Project-Name/file.ext
                        file_links = re.findall(r'file:///[^)]+?/([^/]+)/[^/)]+\.[a-z]+', content, re.IGNORECASE)
                        all_paths.extend(file_links)
                        
                        # Extract from regular paths
                        # Pattern: /path/Desktop/Project-Name/file.ext or similar
                        regular_paths = re.findall(r'/(?:Desktop|Documents|Projects)/([^/\s]+)/', content)
                        all_paths.extend(regular_paths)
                        
                        # Extract from workspace mentions
                        workspace_paths = re.findall(r'workspace:\s*([^\s]+)', content, re.IGNORECASE)
                        all_paths.extend([Path(p).name for p in workspace_paths])
                        
                except Exception as e:
                    pass
        
        # Find most common path (likely the project)
        if all_paths:
            # Filter out common non-project names
            filtered_paths = [p for p in all_paths if p not in ['Users', 'home', 'tmp', 'Desktop', 'Documents']]
            if filtered_paths:
                from collections import Counter
                most_common = Counter(filtered_paths).most_common(1)[0][0]
                project_name = most_common
        
        # Strategy 2: Check task.md header
        if project_name == "Unknown Project" and task_file.exists():
            try:
                with open(task_file, 'r') as f:
                    content = f.read()
                    lines = content.split('\n')
                    
                    # Check first few lines for headers
                    for line in lines[:5]:
                        if line.startswith('#'):
                            header = line.strip('#').strip()
                            # Extract project name from headers like "Project: Name" or "Name - Description"
                            if ':' in header:
                                project_name = header.split(':')[-1].strip()
                                break
                            elif '-' in header:
                                project_name = header.split('-')[0].strip()
                                break
                            else:
                                # Use the header itself if it's not too long
                                if len(header) < 50 and header != "Unknown Project":
                                    project_name = header
                                    break
                    
                    # Count tasks
                    step_count = content.count('- [')
                    
                    # Extract file references
                    files_modified = list(set(re.findall(r'`([^`]+\.[a-z]+)`', content)))
            except Exception as e:
                print(f"Error reading {task_file}: {e}")
        
        # Fallback: Use session directory name if it looks like a meaningful name
        if project_name == "Unknown Project":
            session_name = session_path.name
            # If it's a UUID-like string, keep it as Unknown
            if not re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-', session_name):
                project_name = session_name
        
        return {
            'session_id': session_path.name,
            'project_name': project_name,
            'last_modified': datetime.fromtimestamp(mtime).isoformat(),
            'step_count': step_count,
            'files_modified': files_modified[:10],
            'path': str(session_path)
        }
    
    def get_session_steps(self, session_id: str) -> List[Dict]:
        """Extract reasoning steps from a session"""
        session_path = self.brain_dir / session_id
        steps = []
        
        # Parse task.md
        task_file = session_path / 'task.md'
        if task_file.exists():
            steps.extend(self._parse_task_md(task_file))
        
        # Parse implementation_plan.md
        plan_file = session_path / 'implementation_plan.md'
        if plan_file.exists():
            steps.extend(self._parse_implementation_plan(plan_file))
        
        # Parse walkthrough.md
        walkthrough_file = session_path / 'walkthrough.md'
        if walkthrough_file.exists():
            steps.extend(self._parse_walkthrough(walkthrough_file))
        
        return steps
    
    def _parse_task_md(self, file_path: Path) -> List[Dict]:
        """Parse task.md for checklist items"""
        steps = []
        try:
            with open(file_path, 'r') as f:
                content = f.read()
            
            # Match checklist items
            pattern = r'- \[([ x/])\] (.+)'
            matches = re.findall(pattern, content)
            
            for idx, (status, task) in enumerate(matches, 1):
                # Extract file references from the task text
                files = re.findall(r'`([^`]+\.[a-zA-Z]+)`', task)
                
                steps.append({
                    'step': len(steps) + 1,
                    'thought': f"Task: {task}",
                    'decision': task,
                    'file_examined': files[0] if files else None,
                    'files_modified': files,
                    'status': 'complete' if status == 'x' else ('in_progress' if status == '/' else 'pending'),
                    'timestamp': datetime.now().isoformat()
                })
        except Exception as e:
            print(f"Error parsing {file_path}: {e}")
        
        return steps
    
    def _parse_implementation_plan(self, file_path: Path) -> List[Dict]:
        """Parse implementation plan for design decisions"""
        steps = []
        try:
            with open(file_path, 'r') as f:
                content = f.read()
            
            # Extract headers as decision points
            # Split by headers and get content blocks
            sections = re.split(r'(#{2,3} .+)', content)
            
            for i in range(1, len(sections), 2):
                if i >= len(sections):
                    break
                    
                header = sections[i].strip('# ').strip()
                section_content = sections[i+1] if i+1 < len(sections) else ""
                
                # Extract file references from this section
                files = re.findall(r'`([^`]+\.[a-zA-Z]+)`', section_content)
                # Also look for markdown file links
                file_links = re.findall(r'\[([^\]]+\.(?:py|js|tsx|ts|md|json))\]', section_content)
                files.extend(file_links)
                files = list(set(files))  # Remove duplicates
                
                steps.append({
                    'step': len(steps) + 1,
                    'thought': f"Planning: {header}",
                    'decision': header,
                    'file_examined': files[0] if files else None,
                    'files_modified': files,
                    'timestamp': datetime.now().isoformat()
                })
        except Exception as e:
            print(f"Error parsing {file_path}: {e}")
        
        return steps
    
    def _parse_walkthrough(self, file_path: Path) -> List[Dict]:
        """Parse walkthrough for completed work"""
        steps = []
        try:
            with open(file_path, 'r') as f:
                content = f.read()
            
            # Extract major sections
            headers = re.findall(r'#{2,3} (.+)', content)
            for header in headers:
                steps.append({
                    'step': len(steps) + 1,
                    'thought': f"Completed: {header}",
                    'decision': f"Verified: {header}",
                    'file_examined': str(file_path),
                    'timestamp': datetime.now().isoformat()
                })
        except Exception as e:
            print(f"Error parsing {file_path}: {e}")
        
        return steps


if __name__ == "__main__":
    import sys
    import argparse
    
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['list', 'get-steps'])
    parser.add_argument('--session-id', help='Session ID for get-steps')
    
    args = parser.parse_args()
    
    scanner = SessionScanner()
    
    if args.action == 'list':
        sessions = scanner.discover_sessions()
        print(json.dumps(sessions, indent=2))
    
    elif args.action == 'get-steps':
        if not args.session_id:
            print("Error: --session-id required for get-steps")
            sys.exit(1)
        steps = scanner.get_session_steps(args.session_id)
        print(json.dumps(steps, indent=2))
