# Dashboard Feature Demonstration

## Overview

The AI Agent Mind Map Visualizer dashboard now includes real-time status indicators and bidirectional control flow, allowing you to monitor and control the agent's execution state.

## Dashboard Components

### 1. Session History Sidebar (Left)
- Lists all agent sessions in reverse chronological order
- Shows session prompts, timestamps, and step counts
- Branched sessions indicated with 🌿 GitBranch icon
- Active session highlighted with blue accent

### 2. Main Visualization Area (Center)
- Displays the mind map for the selected session
- Custom nodes with icons (Brain, Terminal, FileCode, CheckCircle)
- Auto-layout using Dagre algorithm
- Interactive node selection and details panel

### 3. Status Indicator Banner (Top)
**NEW in Phase 1**: Real-time agent status display

## Status Indicator Demo

The dashboard now shows a colored banner at the top when the agent is not IDLE:

````carousel
![IDLE State - No banner visible, agent ready for new tasks](file:///Users/shauryatiwari/.gemini/antigravity/brain/01fe9fd7-74d9-4f49-8403-c3cd38fca671/dashboard_initial_1763891354607.png)
<!-- slide -->
![PAUSED State - Yellow banner shows "AGENT STATUS: PAUSED"](file:///Users/shauryatiwari/.gemini/antigravity/brain/01fe9fd7-74d9-4f49-8403-c3cd38fca671/dashboard_paused_1763891401829.png)
<!-- slide -->
![Back to IDLE - Banner disappears when agent resumes](file:///Users/shauryatiwari/.gemini/antigravity/brain/01fe9fd7-74d9-4f49-8403-c3cd38fca671/dashboard_idle_again_1763891410436.png)
````

### Status Colors

| Status | Color | Meaning |
|--------|-------|---------|
| **IDLE** | No banner | Agent ready for new tasks |
| **RUNNING** | 🟢 Green | Agent actively processing steps |
| **PAUSED** | 🟡 Yellow | Agent paused, awaiting resume command |
| **ROLLING_BACK** | 🔴 Red | Agent rolling back to previous state |

## Live Demo Recording

![Status indicator transitions](file:///Users/shauryatiwari/.gemini/antigravity/brain/01fe9fd7-74d9-4f49-8403-c3cd38fca671/status_indicator_demo_1763891389950.webp)

This recording shows:
1. Dashboard in IDLE state (no banner)
2. PAUSE command sent → Yellow banner appears
3. RESUME command sent → Banner disappears

## Control Flow Features

### Pause/Resume
- **Pause**: Stops the agent from processing new reasoning steps
- **Resume**: Allows the agent to continue processing
- **Use Case**: Temporarily halt execution to review current state

### Rollback
- **Function**: Revert workspace to a specific Git commit
- **Safety**: Creates automatic backup branch before rollback
- **Use Case**: Undo unwanted changes or explore alternative paths

### Branching
- **Function**: Create new session from a specific checkpoint
- **Git Integration**: Creates new Git branch from commit
- **Use Case**: Explore "what if" scenarios without losing original work

## Technical Implementation

### WebSocket Connection
The dashboard maintains a persistent WebSocket connection to the backend server:

```typescript
const socket = io('http://localhost:3001');

socket.on('agent-event', (message: any) => {
  if (message.event_type === 'agent.status_changed') {
    setAgentStatus(message.payload.status);
  }
});
```

### Status Banner Component
```tsx
{agentStatus !== 'IDLE' && (
  <div className={`fixed top-0 left-0 right-0 z-50 text-center py-1 
      ${agentStatus === 'RUNNING' ? 'bg-green-500/80 text-white' : ''}
      ${agentStatus === 'PAUSED' ? 'bg-yellow-500/80 text-black' : ''}
      ${agentStatus === 'ROLLING_BACK' ? 'bg-red-500/80 text-white' : ''}
  `}>
    AGENT STATUS: {agentStatus}
  </div>
)}
```

## How to Use

### Starting the Dashboard

1. **Start the backend server**:
   ```bash
   cd cli
   node server.js
   ```

2. **Start the dashboard**:
   ```bash
   cd dashboard
   npm run dev
   ```

3. **Open browser**: Navigate to `http://localhost:3000`

### Testing Status Indicators

Run the demo script to see status changes in real-time:

```bash
node cli/demo_status.js
```

This will:
- Send a PAUSE command (yellow banner appears)
- Wait 5 seconds
- Send a RESUME command (banner disappears)

## Next Steps

- **Session Selection**: Click on a session in the sidebar to view its mind map
- **Node Interaction**: Click nodes to see detailed reasoning and alternatives
- **Branch Creation**: Click the branch button on any node to create an alternative timeline
- **Real-time Updates**: Watch new steps appear as the agent processes reasoning traces

## Glassmorphism Design

The dashboard features a modern glassmorphism design with:
- Frosted glass effects (`backdrop-blur-xl`)
- Subtle gradients and shadows
- Smooth transitions and animations
- Dark theme optimized for extended viewing
