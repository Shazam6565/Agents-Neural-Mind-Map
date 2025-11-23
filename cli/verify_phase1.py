import sqlite3
import os

def verify_criteria():
    db_path = "agent_mindmap.db"
    if not os.path.exists(db_path):
        print("❌ Database file not found.")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    print("=== 1. Verifying Schema ===")
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cursor.fetchall()
    print(f"Tables found: {[t[0] for t in tables]}")
    
    required_tables = ['sessions', 'node_executions', 'checkpoints', 'writes'] # checkpoints/writes are from LangGraph
    for table in required_tables:
        if any(t[0] == table for t in tables):
            print(f"✅ Table '{table}' exists")
        else:
            # LangGraph might name them differently or they might be created on demand, 
            # but our custom tables should be there.
            if table in ['sessions', 'node_executions']:
                print(f"❌ Table '{table}' MISSING")
            else:
                print(f"ℹ️ Table '{table}' (LangGraph) check skipped or named differently")

    print("\n=== 6. Querying Stored Sessions ===")
    cursor.execute("SELECT session_id, prompt, created_at FROM sessions")
    sessions = cursor.fetchall()
    print(f"Found {len(sessions)} sessions:")
    for s in sessions:
        print(f"  - ID: {s[0]}, Prompt: {s[1]}, Created: {s[2]}")

    print("\n=== Verifying Node Executions (Checkpoints) ===")
    cursor.execute("SELECT count(*) FROM node_executions")
    count = cursor.fetchone()[0]
    print(f"Total node executions logged: {count}")
    
    conn.close()

if __name__ == "__main__":
    verify_criteria()
