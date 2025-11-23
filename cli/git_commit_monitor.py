#!/usr/bin/env python3
"""
Git Commit Monitor - Captures Git commits as reasoning traces
This monitors a Git repository and converts new commits into reasoning steps
that can be visualized in the Mind Map dashboard.
"""

import json
import subprocess
import time
import sys
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Optional

class GitCommitMonitor:
    def __init__(self, repo_path: str, output_file: str):
        self.repo_path = Path(repo_path)
        self.output_file = Path(output_file)
        self.last_commit_sha = None
        self.step_counter = 0
        
    def get_latest_commit_sha(self) -> Optional[str]:
        """Get the SHA of the latest commit"""
        try:
            result = subprocess.run(
                ['git', 'rev-parse', 'HEAD'],
                cwd=self.repo_path,
                capture_output=True,
                text=True,
                check=True
            )
            return result.stdout.strip()
        except subprocess.CalledProcessError:
            return None
    
    def get_commit_info(self, sha: str) -> Dict:
        """Get detailed information about a commit"""
        try:
            # Get commit message
            msg_result = subprocess.run(
                ['git', 'log', '-1', '--pretty=%B', sha],
                cwd=self.repo_path,
                capture_output=True,
                text=True,
                check=True
            )
            message = msg_result.stdout.strip()
            
            # Get files changed
            files_result = subprocess.run(
                ['git', 'diff-tree', '--no-commit-id', '--name-only', '-r', sha],
                cwd=self.repo_path,
                capture_output=True,
                text=True,
                check=True
            )
            files = files_result.stdout.strip().split('\n')
            
            # Get commit author and date
            info_result = subprocess.run(
                ['git', 'log', '-1', '--pretty=%an|%ad', '--date=iso', sha],
                cwd=self.repo_path,
                capture_output=True,
                text=True,
                check=True
            )
            author, date = info_result.stdout.strip().split('|')
            
            return {
                'sha': sha,
                'message': message,
                'files': [f for f in files if f],
                'author': author,
                'date': date
            }
        except subprocess.CalledProcessError as e:
            print(f"Error getting commit info: {e}")
            return None
    
    def get_new_commits(self) -> List[Dict]:
        """Get all commits since the last processed commit"""
        current_sha = self.get_latest_commit_sha()
        
        if not current_sha:
            return []
        
        if self.last_commit_sha == current_sha:
            return []  # No new commits
        
        try:
            # Get list of commits between last and current
            if self.last_commit_sha:
                result = subprocess.run(
                    ['git', 'rev-list', '--reverse', f'{self.last_commit_sha}..{current_sha}'],
                    cwd=self.repo_path,
                    capture_output=True,
                    text=True,
                    check=True
                )
                commit_shas = result.stdout.strip().split('\n')
            else:
                # First run - just get the latest commit
                commit_shas = [current_sha]
            
            commits = []
            for sha in commit_shas:
                if sha:
                    info = self.get_commit_info(sha)
                    if info:
                        commits.append(info)
            
            self.last_commit_sha = current_sha
            return commits
            
        except subprocess.CalledProcessError as e:
            print(f"Error getting new commits: {e}")
            return []
    
    def commit_to_reasoning_step(self, commit: Dict) -> Dict:
        """Convert a Git commit to a reasoning step"""
        self.step_counter += 1
        
        # Parse commit message to extract thought and decision
        lines = commit['message'].split('\n')
        first_line = lines[0] if lines else "Code change"
        
        # Try to extract structured info from commit message
        thought = f"Working on: {first_line}"
        decision = first_line
        
        # Check if commit message has our structured format
        if 'Thought:' in commit['message']:
            for line in lines:
                if line.startswith('Thought:'):
                    thought = line.replace('Thought:', '').strip()
                elif line.startswith('Decision:'):
                    decision = line.replace('Decision:', '').strip()
        
        return {
            'step': self.step_counter,
            'thought': thought,
            'decision': decision,
            'file_examined': commit['files'][0] if commit['files'] else 'multiple files',
            'alternatives_considered': [
                f"Modified {len(commit['files'])} file(s)",
                f"Commit by {commit['author']}",
                f"At {commit['date']}"
            ],
            'commit_sha': commit['sha'],
            'timestamp': commit['date']
        }
    
    def update_reasoning_trace(self, new_steps: List[Dict]):
        """Update the reasoning trace file with new steps"""
        # Read existing steps
        existing_steps = []
        if self.output_file.exists():
            try:
                with open(self.output_file, 'r') as f:
                    existing_steps = json.load(f)
            except json.JSONDecodeError:
                existing_steps = []
        
        # Append new steps
        all_steps = existing_steps + new_steps
        
        # Write back
        with open(self.output_file, 'w') as f:
            json.dump(all_steps, f, indent=2)
        
        print(f"✓ Added {len(new_steps)} new reasoning step(s)")
    
    def monitor(self, interval: int = 5):
        """Continuously monitor for new commits"""
        print(f"🔍 Monitoring Git repository: {self.repo_path}")
        print(f"📝 Writing reasoning traces to: {self.output_file}")
        print(f"⏱️  Checking every {interval} seconds")
        print()
        
        try:
            while True:
                new_commits = self.get_new_commits()
                
                if new_commits:
                    print(f"\n🆕 Found {len(new_commits)} new commit(s):")
                    reasoning_steps = []
                    
                    for commit in new_commits:
                        print(f"   • {commit['sha'][:7]}: {commit['message'].split(chr(10))[0]}")
                        step = self.commit_to_reasoning_step(commit)
                        reasoning_steps.append(step)
                    
                    self.update_reasoning_trace(reasoning_steps)
                    print()
                
                time.sleep(interval)
                
        except KeyboardInterrupt:
            print("\n\n👋 Monitoring stopped")
            sys.exit(0)

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Monitor Git commits and convert to reasoning traces')
    parser.add_argument('repo_path', help='Path to Git repository to monitor')
    parser.add_argument('--output', '-o', default='reasoning_trace.json', 
                       help='Output file for reasoning traces')
    parser.add_argument('--interval', '-i', type=int, default=5,
                       help='Polling interval in seconds (default: 5)')
    
    args = parser.parse_args()
    
    monitor = GitCommitMonitor(args.repo_path, args.output)
    monitor.monitor(args.interval)
