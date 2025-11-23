import json
import uuid
import time
import subprocess
import socketio
from datetime import datetime
from typing import TypedDict, Optional, List
from pathlib import Path

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.sqlite import SqliteSaver
import sqlite3

# WebSocket Client Setup
sio = socketio.Client()
agent_paused = False

@sio.on('connect')
def on_connect():
    print("Agent connected to WebSocket server")

@sio.on('disconnect')
def on_disconnect():
    print("Agent disconnected from WebSocket server")

@sio.on('agent-event') # Listen to generic agent-event channel if server broadcasts there, or specific if needed
def handle_message(data):
    global agent_paused
    # Check if data is wrapped in our protocol
    event_type = data.get('event_type')
    if event_type == 'agent.pause_requested':
        print("Received pause request")
        agent_paused = True
    elif event_type == 'agent.resume_requested': # Assuming we might want resume too
        print("Received resume request")
        agent_paused = False

# Try to connect to server
try:
    sio.connect('http://localhost:3001')
except Exception as e:
    print(f"Warning: Could not connect to WebSocket server: {e}")

# Define the state schema
class AgentState(TypedDict):
    session_id: str
    prompt: str
    step: int
    thought: str
    file_examined: str
    decision: str
    alternatives: List[str]
    output_text: Optional[str]
    commit_sha: Optional[str]
    step_id: Optional[str]

def git_commit_step(state: AgentState) -> dict:
    """Commit the current step to Git and store metadata"""
    step_id = str(uuid.uuid4())
    
    # Create a readable commit message
    commit_msg = f"Step {state['step']}: {state['decision']}\n\n"
    commit_msg += f"Step-ID: {step_id}\n"
    commit_msg += f"Thought: {state['thought']}\n"
    if state.get('file_examined'):
        commit_msg += f"File: {state['file_examined']}\n"
    
    try:
        # Stage all changes
        subprocess.run(['git', 'add', '.'], check=True)
        
        # Commit
        subprocess.run(['git', 'commit', '--allow-empty', '-m', commit_msg], check=True)
        
        # Get SHA
        result = subprocess.run(['git', 'rev-parse', 'HEAD'], capture_output=True, text=True, check=True)
        sha = result.stdout.strip()
        
        # Store metadata in git notes
        metadata = json.dumps({
            "session_id": state["session_id"],
            "step": state["step"],
            "step_id": step_id,
            "thought": state["thought"],
            "decision": state["decision"],
            "alternatives": state["alternatives"],
            "file_examined": state["file_examined"],
            "timestamp": datetime.now().isoformat()
        }, indent=2)
        
        subprocess.run(['git', 'notes', '--ref=refs/notes/agent-steps', 'add', '-f', '-m', metadata, sha], check=True)
        
        return {'commit_sha': sha, 'step_id': step_id}
        
    except subprocess.CalledProcessError as e:
        print(f"Git operation failed: {e}")
        return {'commit_sha': None, 'step_id': step_id}

class LangGraphMindMap:
    def __init__(self, db_path: str = "agent_mindmap.db"):
        self.db_path = db_path
        # Ensure we can connect to the DB for checkpointing
        conn = sqlite3.connect(db_path, check_same_thread=False)
        self.checkpointer = SqliteSaver(conn)
        self.graph = self._build_graph()
        
    def _build_graph(self) -> StateGraph:
        """Build the LangGraph workflow"""
        workflow = StateGraph(AgentState)
        
        # Single node that processes reasoning steps
        workflow.add_node("process_reasoning_step", self._process_step)
        
        # Simple linear flow
        workflow.add_edge(START, "process_reasoning_step")
        workflow.add_edge("process_reasoning_step", END)
        
        # Compile with checkpointer
        return workflow.compile(checkpointer=self.checkpointer)
    
    def _process_step(self, state: AgentState) -> AgentState:
        """Process a single reasoning step and log to database"""
        global agent_paused
        
        # Pause loop
        while agent_paused:
            print(f"Agent paused at step {state['step']}...")
            time.sleep(1)
            
        # Commit to Git
        git_result = git_commit_step(state)
        state['commit_sha'] = git_result['commit_sha']
        state['step_id'] = git_result['step_id']
        
        # Emit event via WebSocket
        if sio.connected:
            payload = {
                "event_id": str(uuid.uuid4()),
                "event_type": "step.created",
                "timestamp": datetime.now().isoformat(),
                "payload": {
                    "step": state["step"],
                    "thought": state["thought"],
                    "file_examined": state["file_examined"],
                    "decision": state["decision"],
                    "alternatives": state["alternatives"],
                    "commitHash": state["commit_sha"],
                    "stepId": state["step_id"]
                }
            }
            sio.emit('agent-event', payload)
        
        # Log to node_executions table
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO node_executions 
            (session_id, node_name, started_at, finished_at, 
             state_update_json, output_text, commit_sha, step_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            state["session_id"],
            f"step_{state['step']}",
            datetime.now().isoformat(),
            datetime.now().isoformat(),
            json.dumps({
                "step": state["step"],
                "thought": state["thought"],
                "file_examined": state["file_examined"],
                "decision": state["decision"],
                "alternatives": state["alternatives"]
            }),
            state.get("output_text", ""),
            state["commit_sha"],
            state["step_id"]
        ))
        
        conn.commit()
        conn.close()
        
        return state
    
    def create_session(self, prompt: str, parent_session_id: Optional[str] = None) -> str:
        """Create a new session in the database"""
        session_id = str(uuid.uuid4())
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO sessions (session_id, parent_session_id, prompt, created_at)
            VALUES (?, ?, ?, ?)
        """, (session_id, parent_session_id, prompt, datetime.now().isoformat()))
        
        conn.commit()
        conn.close()
        
        return session_id
    
    def process_reasoning_trace(self, trace_file: str = "reasoning_trace.json", 
                                prompt: str = "Agent Task"):
        """Process a reasoning trace file and persist to LangGraph"""
        
        # Create session
        session_id = self.create_session(prompt)
        
        # Read trace file
        try:
            with open(trace_file, 'r') as f:
                steps = json.load(f)
        except FileNotFoundError:
            print(f"Error: Trace file '{trace_file}' not found.")
            return session_id, []
        
        # Process each step through LangGraph
        results = []
        for step_data in steps:
            state = AgentState(
                session_id=session_id,
                prompt=prompt,
                step=step_data["step"],
                thought=step_data["thought"],
                file_examined=step_data.get("file_examined", "N/A"),
                decision=step_data["decision"],
                alternatives=step_data.get("alternatives_considered", []),
                output_text=step_data.get("output", ""),
                commit_sha=None,
                step_id=None
            )
            
            # Run through graph with checkpointing
            config = {"configurable": {"thread_id": session_id}}
            result = self.graph.invoke(state, config)
            results.append(result)
        
        return session_id, results

# Test function
if __name__ == "__main__":
    agent = LangGraphMindMap()
    session_id, results = agent.process_reasoning_trace()
    print(f"Processed session: {session_id}")
    print(f"Total steps: {len(results)}")
    
    # Keep alive for a bit to ensure events send if running standalone
    if sio.connected:
        time.sleep(2)
        sio.disconnect()
