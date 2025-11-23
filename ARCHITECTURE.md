# Architecture Documentation

## System Components

### 1. Brain Monitor (`antigravity_brain_monitor.py`)

**Purpose**: Continuously monitors Antigravity's brain directory and extracts reasoning steps.

**Key Features**:
- Auto-detects latest session or filters by project name
- Parses multiple artifact types (task.md, implementation_plan.md, walkthrough.md)
- Atomic writes to prevent race conditions
- Configurable polling interval (default: 3 seconds)

**How It Works**:
```python
class AntigravityBrainMonitor:
    def monitor(self, interval: int = 3, project_filter: Optional[str] = None):
        while True:
            # Check for new/updated session
            latest_session = self.find_latest_session(
                self.brain_path.parent, 
                project_filter
            )
            
            # Scan for new steps
            new_steps = self.scan_brain_directory()
            
            # Atomic update to reasoning_trace.json
            if new_steps:
                self.update_reasoning_trace(new_steps)
            
            time.sleep(interval)
```

**Project Filtering**:
```python
@staticmethod
def find_latest_session(base_path: Path, project_filter: Optional[str] = None):
    """
    Searches session artifacts for project mentions.
    Filters by checking if project_filter appears in:
    - task.md content
    - implementation_plan.md content
    """
```

### 2. Session Scanner (`session_scanner.py`)

**Purpose**: Discovers all Antigravity sessions and provides session-level API.

**CLI Interface**:
```bash
# List all sessions
python session_scanner.py list

# Get steps for specific session
python session_scanner.py get-steps --session-id <uuid>
```

**Project Name Inference Strategy**:
1. Extract from file:// links in implementation_plan.md
2. Look for project paths in markdown content
3. Parse task.md headers (e.g., "# Tasks for ProjectName")
4. Fall back to "Unknown Project"

**Session Metadata Extraction**:
```python
def get_session_info(self, session_path: Path) -> Optional[Dict]:
    return {
        'session_id': session_path.name,
        'project_name': ...,  # Inferred
        'last_modified': ...,  # File mtime
        'step_count': ...,     # Count of tasks
        'files_modified': ..., # Extracted from backticks
        'path': str(session_path)
    }
```

### 3. LangGraph Manager (`langgraph_manager.py`)

**Purpose**: Maintains agent state with automatic checkpointing via LangGraph.

**State Schema**:
```python
class AgentState(TypedDict):
    messages: List[Dict[str, Any]]      # Conversation history
    current_step: int                    # Current step number
    steps: List[Dict[str, Any]]         # All reasoning steps
    file_snapshots: Dict[str, str]      # File content at each step
```

**Graph Structure**:
```python
def create_graph():
    workflow = StateGraph(AgentState)
    workflow.add_node("agent", process_step)
    workflow.set_entry_point("agent")
    workflow.add_edge("agent", END)
    return workflow
```

This is a simple linear graph. For more complex agentic workflows, you could add:
- Conditional edges for branching logic
- Multiple nodes for different reasoning phases
- Cycles for iterative refinement

**Checkpointing Mechanism**:
```python
def __init__(self, db_path: str):
    self.conn = sqlite3.connect(db_path, check_same_thread=False)
    self.checkpointer = SqliteSaver(self.conn)  # Auto-saves on update_state()
    self.graph = create_graph().compile(checkpointer=self.checkpointer)
```

**Adding Steps**:
```python
def add_step(self, thread_id: str, step_data: Dict[str, Any]):
    config = {"configurable": {"thread_id": thread_id}}
    
    # Get current state (may be None for first step)
    current_state = self.graph.get_state(config).values
    
    # Update state
    new_state = {
        "steps": current_state.get("steps", []) + [step_data],
        "current_step": step_data['step'],
        "messages": current_state.get("messages", []) + [{
            "role": "assistant",
            "content": step_data.get("thought", "")
        }]
    }
    
    # This triggers SqliteSaver to create a checkpoint!
    self.graph.update_state(config, new_state)
```

**Rollback Support**:
```python
def rollback(self, thread_id: str, step_number: int):
    """
    Rollback to a specific step by filtering the steps array.
    In production, you'd restore file snapshots too.
    """
    config = {"configurable": {"thread_id": thread_id}}
    current_state = self.graph.get_state(config).values
    
    new_steps = [s for s in current_state.get("steps", []) 
                 if s['step'] <= step_number]
    
    new_state = {
        **current_state,
        "steps": new_steps,
        "current_step": step_number
    }
    
    self.graph.update_state(config, new_state)
```

### 4. Express API Server (`server.js`)

**Purpose**: Bridge between Python reasoning extraction and React frontend.

**Python Process Spawning**:
```javascript
const scanSessions = () => {
    return new Promise((resolve, reject) => {
        const process = spawn('python3', [
            path.join(__dirname, 'session_scanner.py'),
            'list'
        ]);
        
        let output = '';
        process.stdout.on('data', (data) => output += data.toString());
        
        process.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(error));
            } else {
                resolve(JSON.parse(output));  // Parse JSON from Python
            }
        });
    });
};
```

**API Endpoints**:

```javascript
// GET /api/sessions
app.get('/api/sessions', async (req, res) => {
    const sessions = await scanSessions();
    res.json(sessions);
});

// GET /api/sessions/:id/nodes
app.get('/api/sessions/:id/nodes', async (req, res) => {
    const sessionId = req.params.id;
    const steps = await getSessionSteps(sessionId);
    
    // Transform to frontend format
    const nodes = steps.map((step, index) => ({
        id: index + 1,
        node_name: step.decision || `Step ${step.step}`,
        state: {
            step: step.step,
            thought: step.thought,
            decision: step.decision,
            file_examined: step.file_examined,
            alternatives: step.alternatives_considered || []
        },
        parent_node_id: index > 0 ? index : null,
        step_id: step.step
    }));
    
    res.json(nodes);
});
```

**File Watcher**:
```javascript
// Watch reasoning_trace.json for changes
const startWatcher = () => {
    fsWatcher = fs.watch(REASONING_TRACE_PATH, (eventType) => {
        if (eventType === 'rename') {
            // Atomic write detected - re-establish watch
            setTimeout(() => {
                startWatcher();
                processFileChange();
            }, 100);
        } else {
            processFileChange();
        }
    });
};
```

### 5. Next.js Dashboard

**Session List** (`components/SessionHistory.tsx`):
```typescript
const fetchSessions = async () => {
    const response = await fetch('http://localhost:3001/api/sessions');
    const data = await response.json();
    setSessions(data);
};
```

**Mind Map** (`components/MindMap.tsx`):
- Uses React Flow for node-based visualization
- Dagre algorithm for automatic layout
- Custom node components with icons
- Glassmorphism styling

**Data Loading** (`app/page.tsx`):
```typescript
const loadSessionNodes = async (sessionId: string) => {
    const response = await fetch(
        `http://localhost:3001/api/sessions/${sessionId}/nodes`
    );
    const nodeData = await response.json();
    
    // Convert to React Flow format
    const flowNodes = nodeData.map((node: any) => ({
        id: node.id.toString(),
        type: 'custom',
        position: { x: 0, y: 0 },  // Dagre will position
        data: {
            label: node.node_name,
            step: node.state.step,
            thought: node.state.thought,
            ...
        }
    }));
    
    setNodes(flowNodes);
};
```

## Data Transformation Pipeline

### Step 1: Artifact → JSON

**Input** (`task.md`):
```markdown
- [x] Add navbar component
- [/] Style with Tailwind
- [ ] Add footer
```

**Output** (`reasoning_trace.json`):
```json
[
  {
    "step": 1,
    "thought": "Working on: Add navbar component",
    "decision": "Add navbar component",
    "file_examined": "task.md",
    "status": "complete"
  },
  {
    "step": 2,
    "thought": "Working on: Style with Tailwind",
    "decision": "Style with Tailwind", 
    "file_examined": "task.md",
    "status": "in_progress"
  }
]
```

### Step 2: JSON → LangGraph State

```python
# In langgraph_manager.py
step_data = {
    "step": 1,
    "thought": "Working on: Add navbar component",
    "decision": "Add navbar component",
    ...
}

manager.add_step("main-thread", step_data)
# → Creates checkpoint in SQLite
```

**SQLite Schema** (auto-created by SqliteSaver):
```sql
CREATE TABLE checkpoints (
    thread_id TEXT,
    checkpoint_id TEXT,
    parent_id TEXT,
    checkpoint BLOB,  -- Serialized state
    metadata TEXT,
    PRIMARY KEY (thread_id, checkpoint_id)
);
```

### Step 3: SQLite → REST API

```javascript
// server.js calls Python
const steps = await runLangGraph('get');  // Spawns langgraph_manager.py

// Returns array of step objects
```

### Step 4: REST API → React

```typescript
const nodes = steps.map((step, index) => ({
    id: index + 1,
    type: 'custom',
    data: { ...step },
    ...
}));

setNodes(nodes);  // React Flow renders
```

## Performance Characteristics

### Brain Monitor
- **Polling Frequency**: 3 seconds (configurable)
- **File I/O**: ~5-10ms per artifact read
- **JSON Write**: <1ms (atomic)
- **Memory**: ~50MB for 1000 steps

### Session Scanner
- **Discovery Time**: ~100ms for 10 sessions
- **Regex Parsing**: ~10ms per artifact
- **JSON Output**: <5ms

### LangGraph Manager
- **State Update**: ~5-10ms (including SQLite write)
- **Get State**: ~2-3ms (SQLite read)
- **Rollback**: ~5ms
- **Database Size**: ~1MB per 1000 checkpoints

### Express Server
- **Python Spawn**: ~100ms cold start
- **JSON Parse**: <5ms
- **Response Time**: ~150ms total

### Frontend
- **Session List**: ~50ms render
- **Mind Map**: ~200ms for 100 nodes
- **Dagre Layout**: ~100ms for 100 nodes
- **Total Load Time**: ~500ms

## Scaling Considerations

### Current Limits
- **Sessions**: Tested with 10+
- **Steps per Session**: Tested with 500+
- **File Size**: reasoning_trace.json up to 1MB

### Bottlenecks
1. **File Polling**: 3-second delay for updates
2. **Python Spawning**: 100ms overhead per API call
3. **JSON Parsing**: O(n) with file size

### Optimization Strategies
1. **WebSocket for Live Updates**: Replace polling
2. **Long-lived Python Process**: Avoid spawn overhead
3. **Incremental Parsing**: Stream JSON instead of full parse
4. **Database Indexing**: Add indexes on thread_id

## Security Considerations

### Current Implementation
- **No Authentication**: Local-only deployment
- **File System Access**: Reads from ~/.gemini/antigravity/brain
- **CORS**: Open to all origins (`*`)

### Production Hardening Needed
1. Add authentication to API endpoints
2. Validate session IDs (prevent directory traversal)
3. Rate limit API calls
4. Restrict CORS to known origins
5. Sanitize markdown input to prevent XSS

## Future Enhancements

### Phase 1: State Management
- [ ] Add branching support (timeline visualization)
- [ ] Implement file diff tracking
- [ ] Add undo/redo for rollbacks

### Phase 2: Collaboration
- [ ] Multi-agent session support
- [ ] Real-time collaboration via WebSocket
- [ ] Session sharing/export

### Phase 3: Analytics
- [ ] Step duration tracking
- [ ] File change frequency heatmap
- [ ] Decision pattern analysis

### Phase 4: Integration
- [ ] VS Code extension
- [ ] Slack notifications
- [ ] GitHub commit correlation
