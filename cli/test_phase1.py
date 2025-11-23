#!/usr/bin/env python3
"""Test script for Phase 1 implementation"""

import json
import time
from langgraph_agent import LangGraphMindMap

def test_pipeline():
    print("=== Testing Phase 1 LangGraph Pipeline ===\n")
    
    # Create test reasoning trace
    test_trace = [
        {
            "step": 1,
            "thought": "Testing LangGraph integration",
            "file_examined": "test.py",
            "decision": "Initialize database",
            "alternatives_considered": ["Skip database", "Use different DB"]
        },
        {
            "step": 2,
            "thought": "Process reasoning step",
            "file_examined": "N/A",
            "decision": "Create checkpoint",
            "alternatives_considered": ["In-memory only"]
        }
    ]
    
    # Write test trace
    with open("reasoning_trace.json", "w") as f:
        json.dump(test_trace, f, indent=2)
    
    print("✓ Created test reasoning_trace.json")
    
    # Process through LangGraph
    agent = LangGraphMindMap()
    session_id, results = agent.process_reasoning_trace(
        prompt="Test Phase 1 Implementation"
    )
    
    print(f"✓ Processed through LangGraph")
    print(f"  Session ID: {session_id}")
    print(f"  Steps processed: {len(results)}")
    
    # Verify database
    import sqlite3
    conn = sqlite3.connect("agent_mindmap.db")
    cursor = conn.cursor()
    
    cursor.execute("SELECT COUNT(*) FROM sessions WHERE session_id = ?", (session_id,))
    session_count = cursor.fetchone()[0]
    print(f"✓ Sessions in DB: {session_count}")
    
    cursor.execute("SELECT COUNT(*) FROM node_executions WHERE session_id = ?", (session_id,))
    node_count = cursor.fetchone()[0]
    print(f"✓ Node executions in DB: {node_count}")
    
    conn.close()
    
    print("\n=== Phase 1 Test Complete ===")
    print("Next: Start server and dashboard to see real-time updates")

if __name__ == "__main__":
    test_pipeline()
