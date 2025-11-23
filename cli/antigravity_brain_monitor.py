#!/usr/bin/env python3
"""
Antigravity Brain Monitor - Captures reasoning from Antigravity's brain directory
This monitors Antigravity's session files and extracts reasoning steps in real-time.
"""

import json
import os
import re
import time
import sys
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Optional

class AntigravityBrainMonitor:
    def __init__(self, brain_session_path: str, output_file: str):
        self.brain_path = Path(brain_session_path)
        self.output_file = Path(output_file)
        self.step_counter = 0
        self.processed_tasks = set()
        
    def parse_task_md(self, task_file: Path) -> List[Dict]:
        """Parse task.md to extract reasoning steps from checklist items"""
        if not task_file.exists():
            return []
        
        with open(task_file, 'r') as f:
            content = f.read()
        
        # Extract checklist items
        # Format: - [x] Task description <!-- id: N -->
        pattern = r'- \[([ x/])\] (.+?)(?:<!--.*?-->)?$'
        
        steps = []
        for match in re.finditer(pattern, content, re.MULTILINE):
            status, description = match.groups()
            
            # Only process completed or in-progress tasks
            if status in ['x', '/']:
                task_id = f"task_{hash(description)}"
                
                # Skip if already processed
                if task_id in self.processed_tasks:
                    continue
                
                self.processed_tasks.add(task_id)
                self.step_counter += 1
                
                steps.append({
                    'step': self.step_counter,
                    'thought': f"Working on: {description}",
                    'decision': description,
                    'file_examined': 'task.md',
                    'alternatives_considered': [
                        'Complete this task',
                        'Skip to next task',
                        'Break down into subtasks'
                    ],
                    'timestamp': datetime.now().isoformat()
                })
        
        return steps
    
    def parse_implementation_plan(self, plan_file: Path) -> List[Dict]:
        """Parse implementation_plan.md to extract design decisions"""
        if not plan_file.exists():
            return []
        
        with open(plan_file, 'r') as f:
            content = f.read()
        
        steps = []
        
        # Extract sections (## headers)
        sections = re.split(r'\n## ', content)
        
        for section in sections[1:]:  # Skip first (before any ##)
            lines = section.split('\n')
            title = lines[0].strip()
            
            # Skip if already processed
            section_id = f"plan_{hash(title)}"
            if section_id in self.processed_tasks:
                continue
            
            self.processed_tasks.add(section_id)
            self.step_counter += 1
            
            # Extract first paragraph as thought
            thought = ""
            for line in lines[1:]:
                if line.strip() and not line.startswith('#'):
                    thought = line.strip()
                    break
            
            steps.append({
                'step': self.step_counter,
                'thought': thought or f"Planning: {title}",
                'decision': f"Design decision: {title}",
                'file_examined': 'implementation_plan.md',
                'alternatives_considered': [
                    'Current approach',
                    'Alternative design',
                    'Defer decision'
                ],
                'timestamp': datetime.now().isoformat()
            })
        
        return steps
    
    def parse_walkthrough(self, walkthrough_file: Path) -> List[Dict]:
        """Parse walkthrough.md to extract completed work"""
        if not walkthrough_file.exists():
            return []
        
        with open(walkthrough_file, 'r') as f:
            content = f.read()
        
        steps = []
        
        # Extract main sections
        sections = re.split(r'\n## ', content)
        
        for section in sections[1:]:
            lines = section.split('\n')
            title = lines[0].strip()
            
            section_id = f"walkthrough_{hash(title)}"
            if section_id in self.processed_tasks:
                continue
            
            self.processed_tasks.add(section_id)
            self.step_counter += 1
            
            steps.append({
                'step': self.step_counter,
                'thought': f"Completed: {title}",
                'decision': f"Verified: {title}",
                'file_examined': 'walkthrough.md',
                'alternatives_considered': [
                    'Implementation complete',
                    'Needs refinement',
                    'Requires testing'
                ],
                'timestamp': datetime.now().isoformat()
            })
        
        return steps
    
    def scan_brain_directory(self) -> List[Dict]:
        """Scan the brain directory for all reasoning artifacts"""
        all_steps = []
        
        # Check for task.md
        task_file = self.brain_path / 'task.md'
        all_steps.extend(self.parse_task_md(task_file))
        
        # Check for implementation_plan.md
        plan_file = self.brain_path / 'implementation_plan.md'
        all_steps.extend(self.parse_implementation_plan(plan_file))
        
        # Check for walkthrough.md
        walkthrough_file = self.brain_path / 'walkthrough.md'
        all_steps.extend(self.parse_walkthrough(walkthrough_file))
        
        return all_steps
    
    def update_reasoning_trace(self, new_steps: List[Dict]):
        """Append new steps to the reasoning trace file"""
        if not new_steps:
            return
        
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
        
        # Atomic write: write to temp file then rename
        temp_file = self.output_file.with_suffix('.tmp')
        try:
            with open(temp_file, 'w') as f:
                json.dump(all_steps, f, indent=2)
            
            # Atomic rename
            temp_file.replace(self.output_file)
            
            print(f"✓ Added {len(new_steps)} new reasoning step(s)")
            for step in new_steps:
                print(f"   Step {step['step']}: {step['decision']}")
                
        except Exception as e:
            print(f"❌ Error writing reasoning trace: {e}")
            if temp_file.exists():
                temp_file.unlink()
    
    @staticmethod
    def find_latest_session(base_path: Path) -> Optional[Path]:
        """Find the most recently modified session directory"""
        if not base_path.exists():
            return None
            
        sessions = [d for d in base_path.iterdir() if d.is_dir()]
        if not sessions:
            return None
            
        return max(sessions, key=lambda d: d.stat().st_mtime)

    def monitor(self, interval: int = 3):
        """Continuously monitor the brain directory"""
        print(f"🧠 Monitoring Antigravity Brain: {self.brain_path}")
        print(f"📝 Writing reasoning traces to: {self.output_file}")
        print(f"⏱️  Checking every {interval} seconds")
        print()
        
        try:
            while True:
                # Check if we should switch to a newer session
                if self.brain_path.parent.exists():
                    latest_session = self.find_latest_session(self.brain_path.parent)
                    if latest_session and latest_session != self.brain_path:
                        print(f"\n🔄 Detected new session: {latest_session.name}")
                        print(f"   Switching monitor to new session...")
                        self.brain_path = latest_session
                        # Optional: Reset processed tasks if you want to re-capture from new session
                        # self.processed_tasks.clear() 
                
                new_steps = self.scan_brain_directory()
                
                if new_steps:
                    self.update_reasoning_trace(new_steps)
                    print()
                
                time.sleep(interval)
                
        except KeyboardInterrupt:
            print("\n\n👋 Monitoring stopped")
            sys.exit(0)

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(
        description='Monitor Antigravity brain directory and extract reasoning'
    )
    parser.add_argument(
        '--brain-path', '-b',
        help='Path to Antigravity brain session directory. If not provided, auto-detects latest session.'
    )
    parser.add_argument(
        '--output', '-o',
        default='reasoning_trace.json',
        help='Output file for reasoning traces'
    )
    parser.add_argument(
        '--interval', '-i',
        type=int,
        default=3,
        help='Polling interval in seconds (default: 3)'
    )
    
    args = parser.parse_args()
    
    brain_base_dir = Path.home() / ".gemini/antigravity/brain"
    
    if args.brain_path:
        session_path = Path(args.brain_path)
    else:
        print(f"🔍 Auto-detecting latest session in {brain_base_dir}...")
        session_path = AntigravityBrainMonitor.find_latest_session(brain_base_dir)
        if not session_path:
             print(f"❌ Error: No sessions found in {brain_base_dir}")
             sys.exit(1)
        print(f"✓ Found latest session: {session_path.name}")

    if not session_path.exists():
        print(f"❌ Error: Brain directory does not exist: {session_path}")
        sys.exit(1)
    
    monitor = AntigravityBrainMonitor(str(session_path), args.output)
    monitor.monitor(args.interval)
