import sqlite3
import json
import sys
import argparse
from typing import Dict, List, Any, Optional, TypedDict, Annotated
from pathlib import Path
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.sqlite import SqliteSaver
from dataclasses import asdict

# Define the Agent State
class AgentState(TypedDict):
    messages: List[Dict[str, Any]]
    current_step: int
    steps: List[Dict[str, Any]]
    file_snapshots: Dict[str, str]  # Map file path to content

# Define the Graph Nodes
def process_step(state: AgentState):
    # This node simply records the step. In a real agent, it would generate the step.
    # Here we are just syncing with the external "Brain".
    return state

# Setup the Graph
def create_graph():
    workflow = StateGraph(AgentState)
    workflow.add_node("agent", process_step)
    workflow.set_entry_point("agent")
    workflow.add_edge("agent", END)
    return workflow

class LangGraphManager:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self.checkpointer = SqliteSaver(self.conn)
        self.graph = create_graph().compile(checkpointer=self.checkpointer)

    def add_step(self, thread_id: str, step_data: Dict[str, Any]):
        """Add a new reasoning step to the graph state"""
        
        # 1. Get current state
        config = {"configurable": {"thread_id": thread_id}}
        current_state = self.graph.get_state(config).values
        
        # Initialize if empty
        if not current_state:
            current_state = {
                "messages": [],
                "current_step": 0,
                "steps": [],
                "file_snapshots": {}
            }
            
        # 2. Update state with new step
        steps = current_state.get("steps", [])
        
        # Avoid duplicates
        if any(s['step'] == step_data['step'] for s in steps):
            print(f"Step {step_data['step']} already exists")
            return

        steps.append(step_data)
        
        # Capture file snapshot if a file was examined
        file_snapshots = current_state.get("file_snapshots", {})
        if step_data.get('file_examined'):
            file_path = step_data['file_examined']
            try:
                # Try to read the file content
                # Note: In a real scenario, we might need the full path. 
                # Assuming the monitor provides absolute paths or we run from root.
                if Path(file_path).exists():
                    with open(file_path, 'r') as f:
                        file_snapshots[file_path] = f.read()
            except Exception as e:
                print(f"Warning: Could not snapshot file {file_path}: {e}")

        new_state = {
            "messages": current_state.get("messages", []) + [{"role": "assistant", "content": step_data.get("thought", "")}],
            "current_step": step_data['step'],
            "steps": steps,
            "file_snapshots": file_snapshots
        }

        # 3. Update the graph state
        # We use 'update_state' to manually push the new state
        self.graph.update_state(config, new_state)
        print(f"✓ Saved step {step_data['step']} to LangGraph (Thread: {thread_id})")

    def get_history(self, thread_id: str) -> List[Dict]:
        """Retrieve the full history of steps"""
        config = {"configurable": {"thread_id": thread_id}}
        state = self.graph.get_state(config).values
        return state.get("steps", [])

    def rollback(self, thread_id: str, step_number: int):
        """
        Rollback to a specific step and return restoration details.
        
        Returns dict with:
        - success: bool
        - restored_state: dict
        - backup_checkpoint_id: str
        - files_affected: list
        - checkpoint_id: str
        """
        config = {"configurable": {"thread_id": thread_id}}
        current_state = self.graph.get_state(config)
        
        if not current_state.values:
            return {'success': False, 'error': 'No state found'}

        # Create backup of current state
        backup_id = f"backup_{thread_id}_{current_state.values.get('current_step', 0)}"
        
        steps = current_state.values.get("steps", [])
        
        # Filter steps up to the target
        new_steps = [s for s in steps if s['step'] <= step_number]
        
        # Get file snapshots from the restored state
        file_snapshots = current_state.values.get("file_snapshots", {})
        files_affected = list(file_snapshots.keys())
        
        new_state = {
            **current_state.values,
            "steps": new_steps,
            "current_step": step_number
        }
        
        self.graph.update_state(config, new_state)
        print(f"✓ Rolled back to step {step_number}")
        
        return {
            'success': True,
            'restored_state': new_state,
            'backup_checkpoint_id': backup_id,
            'files_affected': files_affected,
            'step_count': len(new_steps),
            'checkpoint_id': current_state.config.get('checkpoint_id', 'unknown')
        }
    
    def get_checkpoint_history(self, thread_id: str):
        """Get all available checkpoints for a thread"""
        config = {"configurable": {"thread_id": thread_id}}
        state = self.graph.get_state(config)
        
        if not state.values:
            return []
        
        steps = state.values.get("steps", [])
        return [
            {
                'step': step['step'],
                'thought': step.get('thought', ''),
                'decision': step.get('decision', ''),
                'timestamp': step.get('timestamp', ''),
                'files': step.get('file_examined', '')
            }
            for step in steps
        ]

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['add', 'get', 'rollback', 'get-history'])
    parser.add_argument('--db', required=True)
    parser.add_argument('--thread', required=True)
    parser.add_argument('--data', help='JSON string for add action')
    parser.add_argument('--step', type=int, help='Step number for rollback')
    
    args = parser.parse_args()
    
    manager = LangGraphManager(args.db)
    
    if args.action == 'add':
        if args.data and args.data != '-':
            step_data = json.loads(args.data)
        else:
            # Read from stdin
            try:
                input_data = sys.stdin.read()
                if not input_data.strip():
                     print("Error: No data provided via stdin")
                     sys.exit(1)
                step_data = json.loads(input_data)
            except json.JSONDecodeError as e:
                print(f"Error decoding JSON from stdin: {e}")
                sys.exit(1)
                
        manager.add_step(args.thread, step_data)
        
    elif args.action == 'get':
        history = manager.get_history(args.thread)
        print(json.dumps(history, indent=2))
    
    elif args.action == 'get-history':
        checkpoints = manager.get_checkpoint_history(args.thread)
        print(json.dumps(checkpoints, indent=2))
        
    elif args.action == 'rollback':
        if args.step is None:
            print("Error: --step required for rollback")
            sys.exit(1)
        result = manager.rollback(args.thread, args.step)
        print(json.dumps(result, indent=2))
