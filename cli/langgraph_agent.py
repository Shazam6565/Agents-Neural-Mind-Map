import json
import uuid
from datetime import datetime
from typing import TypedDict, Optional, List
from pathlib import Path

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.sqlite import SqliteSaver
import sqlite3

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
        
        # Log to node_executions table
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO node_executions 
            (session_id, node_name, started_at, finished_at, 
             state_update_json, output_text)
            VALUES (?, ?, ?, ?, ?, ?)
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
            state.get("output_text", "")
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
                output_text=step_data.get("output", "")
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
