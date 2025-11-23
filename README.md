# 🧠 AI Agent Mind Map Visualizer

Real-time visualization of AI agent reasoning using LangGraph state management and SQLite persistence. This tool captures Antigravity's thought process from its brain directory and displays it as an interactive mind map.

![Mind Map Visualization](https://img.shields.io/badge/Status-Active-green) ![LangGraph](https://img.shields.io/badge/LangGraph-Powered-blue) ![Next.js](https://img.shields.io/badge/Next.js-16.0-black)

## 🎯 Overview

This project creates a live "mind map" of an AI agent's reasoning process by:
1. **Monitoring** Antigravity's brain directory for session artifacts
2. **Extracting** reasoning steps from `task.md`, `implementation_plan.md`, and `walkthrough.md`
3. **Persisting** state using LangGraph with SQLite checkpointing
4. **Visualizing** the thought process in an interactive React Flow diagram

## 🏗️ Architecture

### Data Flow Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                    Antigravity IDE Session                       │
│  Creates artifacts: task.md, implementation_plan.md, etc.       │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              Brain Monitor (Python)                              │
│  • Watches ~/.gemini/antigravity/brain/<session-id>/           │
│  • Parses markdown artifacts for reasoning steps                │
│  • Writes to reasoning_trace.json (atomic writes)               │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              Session Scanner (Python)                            │
│  • Discovers all sessions in brain directory                    │
│  • Extracts metadata (project name, step count, files)          │
│  • Returns session list via CLI                                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              LangGraph Manager (Python)                          │
│  • Maintains agent state in LangGraph StateGraph                │
│  • Persists to SQLite via SqliteSaver checkpointer             │
│  • Supports add, get, and rollback operations                   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              Express API Server (Node.js)                        │
│  • GET /api/sessions - List all sessions                        │
│  • GET /api/sessions/:id/nodes - Get reasoning steps            │
│  • POST /api/rollback - Rollback to checkpoint                  │
│  • WebSocket for real-time updates                              │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              Next.js Dashboard (React)                           │
│  • Session list sidebar                                         │
│  • Interactive mind map (React Flow + Dagre layout)             │
│  • Real-time status updates via WebSocket                       │
└─────────────────────────────────────────────────────────────────┘
```

## 🔧 How It Works

### 1. Brain Monitoring (`antigravity_brain_monitor.py`)

The brain monitor continuously scans Antigravity's session directory:

```python
class AntigravityBrainMonitor:
    def __init__(self, brain_session_path: str, output_file: str):
        self.brain_path = Path(brain_session_path)
        self.output_file = Path(output_file)
```

**What it captures:**
- **Task Checklist Items** from `task.md` - Tracks completion status
- **Design Decisions** from `implementation_plan.md` - Captures planning thoughts
- **Verification Results** from `walkthrough.md` - Documents completed work

**Atomic Writes:**
```python
# Write to temp file first, then atomic rename
temp_file = self.output_file.with_suffix('.tmp')
with open(temp_file, 'w') as f:
    json.dump(all_steps, f, indent=2)
temp_file.replace(self.output_file)  # Atomic operation
```

### 2. Session Discovery (`session_scanner.py`)

Automatically discovers all Antigravity sessions without manual configuration:

```python
def discover_sessions(self) -> List[Dict]:
    """Scans ~/.gemini/antigravity/brain/ for all sessions"""
    for session_path in self.brain_dir.iterdir():
        session_info = self.get_session_info(session_path)
        sessions.append(session_info)
```

**Extracts:**
- `session_id` - Unique session identifier
- `project_name` - Inferred from file paths or headers
- `step_count` - Number of reasoning steps
- `files_modified` - List of files mentioned in artifacts

### 3. LangGraph State Management (`langgraph_manager.py`)

Uses LangGraph for stateful agent execution tracking:

```python
class AgentState(TypedDict):
    messages: List[Dict[str, Any]]
    current_step: int
    steps: List[Dict[str, Any]]
    file_snapshots: Dict[str, str]  # Version control!
```

**Why LangGraph?**
- **Checkpointing**: Automatic state snapshots via `SqliteSaver`
- **Time Travel**: Rollback to any previous step
- **Persistence**: SQLite storage survives restarts
- **Graph Structure**: Natural fit for branching reasoning paths

**State Updates:**
```python
def add_step(self, thread_id: str, step_data: Dict[str, Any]):
    config = {"configurable": {"thread_id": thread_id}}
    current_state = self.graph.get_state(config).values
    
    # Append new step
    new_state = {
        "steps": current_state.get("steps", []) + [step_data],
        "current_step": step_data['step'],
        ...
    }
    
    self.graph.update_state(config, new_state)  # Auto-checkpoint!
```

### 4. SQLite Persistence

LangGraph uses `SqliteSaver` which creates checkpoints in SQLite:

```python
self.conn = sqlite3.connect(db_path, check_same_thread=False)
self.checkpointer = SqliteSaver(self.conn)
self.graph = create_graph().compile(checkpointer=self.checkpointer)
```

**Database Schema** (created by SqliteSaver):
- `checkpoints` table - Stores graph state snapshots
- `writes` table - Records state mutations
- Indexed by `thread_id` and `checkpoint_id`

**Querying checkpoints:**
```sql
SELECT count(*) FROM checkpoints;  -- Get total snapshots
```

### 5. REST API (`server.js`)

Express server bridges Python brain monitoring with the frontend:

```javascript
// Spawn Python process to scan sessions
const scanSessions = () => {
    return new Promise((resolve, reject) => {
        const process = spawn('python3', [
            path.join(__dirname, 'session_scanner.py'),
            'list'
        ]);
        // Parse JSON output and return
    });
};
```

**Key Endpoints:**
- `GET /api/sessions` - Returns all discovered sessions
- `GET /api/sessions/:id/nodes` - Returns reasoning steps for a session
- `POST /api/rollback` - Triggers LangGraph rollback

## 📦 Installation

### Prerequisites
- Node.js 16+
- Python 3.8+
- Antigravity IDE with active sessions

### Setup

```bash
# Clone repository
cd "Desktop/Agents Neural Mind map"

# Install Python dependencies
pip install langgraph langchain-core

# Install Node dependencies
cd cli && npm install
cd ../dashboard && npm install
```

### Configuration

The system auto-detects Antigravity sessions from:
```
~/.gemini/antigravity/brain/<session-id>/
```

No manual configuration required!

## 🚀 Usage

### Start the Complete System

```bash
# Terminal 1: Start API Server
cd cli
./start-server.sh
```

```bash
# Terminal 2: Start Dashboard
cd dashboard
npm run dev
```

Visit **http://localhost:3000** to view the mind map!

### Monitor a Specific Project

```bash
cd cli
./run-for-project.sh "path/to/your/project"
```

This will:
1. Start the brain monitor filtering for that project
2. Start the API server
3. Dashboard shows only relevant sessions

## 📊 Data Format

### Reasoning Step Schema

```json
{
  "step": 1,
  "thought": "Working on: Add navbar component",
  "decision": "Add navbar component",
  "file_examined": "components/Navbar.tsx",
  "alternatives_considered": [
    "Complete this task",
    "Skip to next task",
    "Break down into subtasks"
  ],
  "timestamp": "2025-11-23T10:15:30.123456"
}
```

### Session Metadata

```json
{
  "session_id": "d9fd3278-59f9-4a4f-881a-a6b64721de4b",
  "project_name": "Shaurya-Portfolio",
  "last_modified": "2025-11-23T09:15:17.984031",
  "step_count": 6,
  "files_modified": ["Navbar.tsx", "Footer.tsx"],
  "path": "/Users/.../.gemini/antigravity/brain/..."
}
```

## 🎨 Features

- **Real-time Monitoring**: Updates as Antigravity works
- **Interactive Mind Map**: Zoom, pan, and explore reasoning
- **Multiple Sessions**: Switch between different agent sessions
- **Glassmorphism UI**: Modern, premium design
- **Custom Node Types**: Visual indicators for different step types
- **Auto-Layout**: Dagre algorithm for clean hierarchies

## 🔍 How IDE Reasoning is Captured

### 1. Antigravity creates artifacts during execution:

**task.md:**
```markdown
# Tasks for Shaurya-Portfolio

- [x] Add navbar <!-- Captured as step 1 -->
- [/] Style components <!-- Captured as step 2, in-progress -->
- [ ] Add footer <!-- Not yet captured -->
```

**implementation_plan.md:**
```markdown
## Proposed Changes

### Components

#### [MODIFY] Navbar.tsx
Add theming support...
```

### 2. Brain Monitor parses with regex:

```python
# Extract checklist pattern
pattern = r'- \[([ x/])\] (.+)'
matches = re.findall(pattern, content)

for status, task in matches:
    if status in ['x', '/']:  # Only completed/in-progress
        steps.append({
            'step': ...,
            'decision': task,
            'status': 'complete' if status == 'x' else 'in_progress'
        })
```

### 3. LangGraph persists to SQLite:

```python
self.graph.update_state(config, new_state)
# Automatically creates checkpoint in SQLite
```

### 4. Frontend queries and visualizes:

```typescript
const response = await fetch(`/api/sessions/${sessionId}/nodes`);
const nodes = await response.json();
// Render as React Flow graph
```

## 🛠️ Troubleshooting

### No sessions showing up?

Check if Antigravity brain directory exists:
```bash
ls ~/.gemini/antigravity/brain/
```

### Empty mind map?

Verify session has artifacts:
```bash
ls ~/.gemini/antigravity/brain/<session-id>/
# Should show task.md, implementation_plan.md, etc.
```

### Database errors?

Reset the database:
```bash
rm -rf test-workspace/.mindmap/agent_mindmap.db
# Restart server to recreate
```

## 📝 Technical Details

### Why This Stack?

- **LangGraph**: Designed for agentic workflows with built-in checkpointing
- **SQLite**: Zero-config persistence, perfect for local desktop apps
- **Next.js**: Fast development with hot reload
- **React Flow**: Purpose-built for node-based UIs
- **Python**: Native integration with Antigravity's filesystem

### Performance

- **Brain Monitor**: Polls every 3 seconds (configurable)
- **Atomic Writes**: Sub-millisecond file updates
- **SQLite**: Handles 10K+ checkpoints efficiently
- **Frontend**: Virtualized rendering for 1000+ nodes

## 🤝 Contributing

This is a proof-of-concept for visualizing agentic AI reasoning. Future enhancements:

- [ ] Branch visualization for timeline exploration
- [ ] Diff view for file changes
- [ ] Real-time collaboration between multiple agents
- [ ] Export to various formats (PDF, PNG, JSON)

## 📄 License

MIT

## 🙏 Credits

Built with:
- [LangGraph](https://github.com/langchain-ai/langgraph) - State management
- [React Flow](https://reactflow.dev/) - Mind map visualization
- [Next.js](https://nextjs.org/) - Frontend framework
- [Antigravity](https://deepmind.google/technologies/gemini/) - The AI being visualized!

---

**Made with 🧠 by visualizing AI thinking in real-time**
