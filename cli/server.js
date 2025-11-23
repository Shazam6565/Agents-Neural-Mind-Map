const { Server } = require("socket.io");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const express = require("express");
const cors = require("cors");
const GitStateManager = require("./git-state-manager");
const WebSocketProtocol = require("./websocket-protocol");

// Configuration
const WORKSPACE_PATH = process.env.WORKSPACE_PATH || path.join(__dirname, "../workspace");
const DB_PATH = path.join(__dirname, "../agent_mindmap.db");

// Ensure workspace directory exists
if (!fs.existsSync(WORKSPACE_PATH)) {
    console.log(`Creating workspace directory at: ${WORKSPACE_PATH}`);
    fs.mkdirSync(WORKSPACE_PATH, { recursive: true });
}

// Initialize Git State Manager
const gitStateManager = new GitStateManager(WORKSPACE_PATH);
gitStateManager.initialize().catch(console.error);

// Create Express app
const app = express();
app.use(cors());
app.use(express.json());

// Agent State Tracking
let agentState = {
    status: 'IDLE', // IDLE | RUNNING | PAUSED | ROLLING_BACK
    currentStep: null,
    pauseRequested: false
};

// Helper: Message Deduplication
async function checkAndRecordMessage(eventId, messageType) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH);
        db.get("SELECT message_id FROM processed_messages WHERE message_id = ?", [eventId], (err, row) => {
            if (err) {
                db.close();
                return reject(err);
            }
            if (row) {
                db.close();
                return resolve(false); // Already processed
            }

            // Record it
            db.run("INSERT INTO processed_messages (message_id, message_type, processed_at) VALUES (?, ?, ?)",
                [eventId, messageType, new Date().toISOString()],
                (insertErr) => {
                    db.close();
                    if (insertErr) return reject(insertErr);
                    resolve(true); // New message
                }
            );
        });
    });
}

// ============================================
// REST API ENDPOINTS
// ============================================

// Get all sessions
app.get('/api/sessions', (req, res) => {
    const db = new sqlite3.Database(DB_PATH);

    db.all(`
        SELECT s.session_id, s.parent_session_id, s.prompt, s.created_at, s.git_branch, s.base_commit_sha,
               (SELECT COUNT(*) FROM node_executions WHERE session_id = s.session_id) as step_count
        FROM sessions s
        ORDER BY created_at DESC
    `, [], (err, rows) => {
        db.close();
        if (err) {
            console.error('Error fetching sessions:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// Get all nodes for a specific session
app.get('/api/sessions/:sessionId/nodes', (req, res) => {
    const db = new sqlite3.Database(DB_PATH);

    db.all(`
        SELECT id, node_name, parent_node_id, started_at, 
               finished_at, state_update_json, output_text, commit_sha, step_id
        FROM node_executions
        WHERE session_id = ?
        ORDER BY id ASC
    `, [req.params.sessionId], (err, rows) => {
        db.close();
        if (err) {
            console.error('Error fetching nodes:', err);
            return res.status(500).json({ error: err.message });
        }

        const nodes = rows.map(row => ({
            id: row.id,
            node_name: row.node_name,
            parent_node_id: row.parent_node_id,
            started_at: row.started_at,
            finished_at: row.finished_at,
            state: row.state_update_json ? JSON.parse(row.state_update_json) : {},
            output: row.output_text,
            commit_sha: row.commit_sha,
            step_id: row.step_id
        }));

        res.json(nodes);
    });
});

// Get session details
app.get('/api/sessions/:sessionId', (req, res) => {
    const db = new sqlite3.Database(DB_PATH);

    db.get(`
        SELECT session_id, parent_session_id, prompt, created_at, git_branch, base_commit_sha
        FROM sessions
        WHERE session_id = ?
    `, [req.params.sessionId], (err, row) => {
        db.close();
        if (err) {
            console.error('Error fetching session:', err);
            return res.status(500).json({ error: err.message });
        }
        if (!row) {
            return res.status(404).json({ error: 'Session not found' });
        }
        res.json(row);
    });
});

// Create a branch from a checkpoint (Legacy REST endpoint, kept for compatibility)
app.post('/api/sessions/:sessionId/branch', async (req, res) => {
    // This should ideally use the WebSocket flow now, but keeping it for now.
    // ... (Implementation omitted for brevity, assuming dashboard uses WebSocket for new branching)
    res.status(501).json({ error: "Use WebSocket 'branch.create_requested' event instead" });
});

// Resume from checkpoint (prepare state for resumption)
app.post('/api/sessions/:sessionId/resume', (req, res) => {
    const { checkpoint_node_id } = req.body;
    const sessionId = req.params.sessionId;

    if (!checkpoint_node_id) {
        return res.status(400).json({
            error: 'Missing required field: checkpoint_node_id'
        });
    }

    const db = new sqlite3.Database(DB_PATH);

    // Get all nodes up to and including the checkpoint
    db.all(`
        SELECT id, state_update_json
        FROM node_executions
        WHERE session_id = ? AND id <= ?
        ORDER BY id ASC
    `, [sessionId, checkpoint_node_id], (err, rows) => {
        db.close();

        if (err) {
            console.error('Error fetching checkpoint state:', err);
            return res.status(500).json({ error: err.message });
        }

        // Reconstruct state by applying all updates sequentially
        let cumulativeState = {};
        rows.forEach(row => {
            if (row.state_update_json) {
                const update = JSON.parse(row.state_update_json);
                cumulativeState = { ...cumulativeState, ...update };
            }
        });

        res.json({
            session_id: sessionId,
            checkpoint_node_id: checkpoint_node_id,
            state: cumulativeState,
            message: 'State reconstructed successfully'
        });
    });
});

// ============================================
// START HTTP SERVER (Express + Socket.IO)
// ============================================

const httpServer = app.listen(3001, () => {
    console.log("✓ API Server started on port 3001");
    console.log(`  Workspace Path: ${WORKSPACE_PATH}`);
    console.log("  Available endpoints:");
    console.log("    GET  /api/sessions");
    console.log("    GET  /api/sessions/:id");
    console.log("    GET  /api/sessions/:id/nodes");
});

// Attach Socket.IO to the same HTTP server
const io = new Server(httpServer, {
    cors: { origin: "*" }
});

console.log("✓ WebSocket server attached to port 3001");

// ============================================
// WEBSOCKET LOGIC
// ============================================

const reasoningTracePath = path.join(__dirname, "../reasoning_trace.json");
console.log(`✓ Watching for reasoning traces at: ${reasoningTracePath}`);

let processedSteps = new Set();

// Initial read
if (fs.existsSync(reasoningTracePath)) {
    try {
        const content = fs.readFileSync(reasoningTracePath, "utf8");
        const steps = JSON.parse(content);
        steps.forEach(step => processedSteps.add(step.step));
    } catch (e) {
        console.error("Error reading initial reasoning trace:", e);
    }
}

// Watch for changes
fs.watch(reasoningTracePath, (eventType) => {
    if (eventType === 'change') {
        if (agentState.status === 'PAUSED' || agentState.status === 'ROLLING_BACK') {
            console.log('Agent paused/rolling back, ignoring file changes');
            return;
        }

        fs.readFile(reasoningTracePath, 'utf8', (err, data) => {
            if (err) {
                console.error("Error reading reasoning trace:", err);
                return;
            }

            try {
                const steps = JSON.parse(data);

                // Process through LangGraph when new steps appear
                const newSteps = steps.filter(step => !processedSteps.has(step.step));

                if (newSteps.length > 0) {
                    console.log(`Processing ${newSteps.length} new steps through LangGraph...`);
                    agentState.status = 'RUNNING';
                    io.emit('agent-event', WebSocketProtocol.createMessage(WebSocketProtocol.EVENT_TYPES.STATUS_CHANGED, { status: 'RUNNING' }));

                    // Spawn Python process to run LangGraph
                    const pythonProcess = spawn("python3", [
                        path.join(__dirname, "langgraph_agent.py")
                    ], {
                        cwd: path.join(__dirname, "..") // Run from project root so it finds reasoning_trace.json
                    });

                    pythonProcess.stderr.on('data', (data) => {
                        console.error(`LangGraph Error: ${data}`);
                    });

                    pythonProcess.on('close', async (code) => {
                        console.log(`LangGraph processing completed with code ${code}`);
                        agentState.status = 'IDLE';
                        io.emit('agent-event', WebSocketProtocol.createMessage(WebSocketProtocol.EVENT_TYPES.STATUS_CHANGED, { status: 'IDLE' }));

                        // Now emit events to dashboard AND commit to git
                        for (const step of steps) {
                            if (!processedSteps.has(step.step)) {
                                processedSteps.add(step.step);

                                // Commit to Git
                                try {
                                    const stepId = require('crypto').randomUUID();
                                    const commitHash = await gitStateManager.createStepCommit(
                                        stepId,
                                        step.step,
                                        step.decision,
                                        step.thought,
                                        step.file_examined,
                                        { alternatives: step.alternatives_considered }
                                    );
                                    console.log(`✓ Committed step ${step.step}: ${commitHash}`);

                                    // Update DB with commit info
                                    const db = new sqlite3.Database(DB_PATH);
                                    db.run(`
                                        UPDATE node_executions 
                                        SET commit_sha = ?, step_id = ?
                                        WHERE id = (SELECT MAX(id) FROM node_executions) -- Simplification: assumes last inserted is current
                                    `, [commitHash, stepId]);
                                    db.close();

                                    // Emit event
                                    const payload = {
                                        step: step.step,
                                        thought: step.thought,
                                        file: step.file_examined,
                                        decision: step.decision,
                                        alternatives: step.alternatives_considered,
                                        commitHash: commitHash,
                                        stepId: stepId
                                    };

                                    console.log(`Emitting step ${step.step}`);
                                    io.emit("agent-event", WebSocketProtocol.createMessage(WebSocketProtocol.EVENT_TYPES.STEP_CREATED, payload));

                                } catch (gitError) {
                                    console.error(`Failed to commit step ${step.step}:`, gitError);
                                    io.emit('agent-event', WebSocketProtocol.createError(null, 'GIT_COMMIT_FAILED', gitError.message));
                                }
                            }
                        }
                    });
                }

            } catch (e) {
                console.error("Error parsing reasoning trace JSON:", e);
            }
        });
    }
});

io.on("connection", (socket) => {
    console.log("Dashboard connected");

    // Handle Rollback Request
    socket.on(WebSocketProtocol.EVENT_TYPES.ROLLBACK_REQUESTED, async (message) => {
        console.log(`Received rollback request:`, message);

        try {
            WebSocketProtocol.validate(message);

            // Deduplication
            const isNew = await checkAndRecordMessage(message.event_id, WebSocketProtocol.EVENT_TYPES.ROLLBACK_REQUESTED);
            if (!isNew) {
                console.log(`Duplicate rollback request ${message.event_id} ignored.`);
                return;
            }

            const { commitHash } = message.payload;

            agentState.status = 'ROLLING_BACK';
            agentState.pauseRequested = true;
            io.emit('agent-event', WebSocketProtocol.createMessage(WebSocketProtocol.EVENT_TYPES.STATUS_CHANGED, { status: 'ROLLING_BACK' }));

            // Perform Git Rollback
            const result = await gitStateManager.rollbackToCommit(commitHash);

            // Reset processed steps to match rollback state (simplification)
            // In a real app, we'd need to query the DB/Git to see what steps remain
            // For now, we might need to restart the agent or clear processedSteps partially

            // Emit completion
            socket.emit('agent-event', WebSocketProtocol.createMessage(
                WebSocketProtocol.EVENT_TYPES.ROLLBACK_COMPLETED,
                {
                    success: true,
                    commitHash,
                    backupBranch: result.backupBranch
                },
                message.event_id
            ));

            agentState.status = 'IDLE';
            agentState.pauseRequested = false;
            io.emit('agent-event', WebSocketProtocol.createMessage(WebSocketProtocol.EVENT_TYPES.STATUS_CHANGED, { status: 'IDLE' }));

        } catch (error) {
            console.error("Rollback failed:", error);
            socket.emit('agent-event', WebSocketProtocol.createError(message, 'ROLLBACK_FAILED', error.message));
            agentState.status = 'IDLE'; // Reset to IDLE on error
        }
    });

    // Handle Branch Creation Request
    socket.on(WebSocketProtocol.EVENT_TYPES.BRANCH_REQUESTED, async (message) => {
        console.log(`Received branch request:`, message);

        try {
            WebSocketProtocol.validate(message);

            // Deduplication
            const isNew = await checkAndRecordMessage(message.event_id, WebSocketProtocol.EVENT_TYPES.BRANCH_REQUESTED);
            if (!isNew) {
                console.log(`Duplicate branch request ${message.event_id} ignored.`);
                return;
            }

            const { name, fromCommitHash, parentSessionId } = message.payload;

            const branchName = await gitStateManager.createTimeline(fromCommitHash, name);

            // Create new session in DB
            const newSessionId = require('crypto').randomUUID();
            const createdAt = new Date().toISOString();

            const db = new sqlite3.Database(DB_PATH);
            db.run(`
                INSERT INTO sessions (session_id, parent_session_id, prompt, created_at, git_branch, base_commit_sha)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [newSessionId, parentSessionId, `Branch: ${name}`, createdAt, branchName, fromCommitHash], (err) => {
                db.close();
                if (err) {
                    console.error("Database error creating session:", err);
                    socket.emit('agent-event', WebSocketProtocol.createError(message, 'DB_ERROR', err.message));
                    return;
                }

                // Emit success
                socket.emit('agent-event', WebSocketProtocol.createMessage(
                    WebSocketProtocol.EVENT_TYPES.BRANCH_CREATED,
                    {
                        sessionId: newSessionId,
                        branchName: branchName,
                        name: name
                    },
                    message.event_id
                ));
            });

        } catch (error) {
            console.error("Branch creation failed:", error);
            socket.emit('agent-event', WebSocketProtocol.createError(message, 'BRANCH_FAILED', error.message));
        }
    });

    socket.on("disconnect", () => {
        console.log("Dashboard disconnected");
    });
});
