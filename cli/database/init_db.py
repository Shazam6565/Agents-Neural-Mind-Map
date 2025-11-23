import sqlite3
from pathlib import Path
from datetime import datetime

def init_database(db_path: str = "agent_mindmap.db"):
    """Initialize SQLite database with mind map schema"""
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Sessions table - each prompt execution
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            session_id TEXT PRIMARY KEY,
            parent_session_id TEXT,
            prompt TEXT,
            created_at DATETIME,
            FOREIGN KEY(parent_session_id) REFERENCES sessions(session_id)
        )
    """)
    
    # Node executions - each reasoning step
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS node_executions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            node_name TEXT NOT NULL,
            parent_node_id INTEGER,
            started_at DATETIME,
            finished_at DATETIME,
            state_update_json TEXT,
            output_text TEXT,
            FOREIGN KEY(session_id) REFERENCES sessions(session_id),
            FOREIGN KEY(parent_node_id) REFERENCES node_executions(id)
        )
    """)
    
    # Create indexes for performance
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_session_nodes 
        ON node_executions(session_id, id)
    """)
    
    conn.commit()
    conn.close()
    print(f"Database initialized at {db_path}")

if __name__ == "__main__":
    init_database()
