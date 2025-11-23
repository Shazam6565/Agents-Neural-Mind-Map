const { Server } = require("socket.io");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const express = require("express");
const cors = require("cors");

// Create Express app
const app = express();
app.use(cors());
app.use(express.json());

const DB_PATH = path.join(__dirname, "../agent_mindmap.db");

// ============================================
// REST API ENDPOINTS
// ============================================

// Get all sessions
app.get('/api/sessions', (req, res) => {
    const db = new sqlite3.Database(DB_PATH);

    db.all(`
        SELECT s.session_id, s.parent_session_id, s.prompt, s.created_at,
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
               finished_at, state_update_json, output_text
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
            output: row.output_text
        }));

        res.json(nodes);
    });
});

// Get session details
app.get('/api/sessions/:sessionId', (req, res) => {
    const db = new sqlite3.Database(DB_PATH);

    db.get(`
        SELECT session_id, parent_session_id, prompt, created_at
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

// Create a branch from a checkpoint
app.post('/api/sessions/:sessionId/branch', (req, res) => {
    const { checkpoint_node_id, prompt } = req.body;
    const parentSessionId = req.params.sessionId;

    if (!checkpoint_node_id || !prompt) {
        return res.status(400).json({
            error: 'Missing required fields: checkpoint_node_id and prompt'
        });
    }

    const db = new sqlite3.Database(DB_PATH);
    const newSessionId = require('crypto').randomUUID();

    // Create new session with parent reference
    const createdAt = new Date().toISOString();
    db.run(`
        INSERT INTO sessions (session_id, parent_session_id, prompt, created_at)
        VALUES (?, ?, ?, ?)
    `, [newSessionId, parentSessionId, prompt, createdAt], function (err) {
        if (err) {
            db.close();
            console.error('Error creating branch:', err);
            return res.status(500).json({ error: err.message });
        }

        // Get the checkpoint state
        db.get(`
            SELECT state_update_json
            FROM node_executions
            WHERE id = ?
        `, [checkpoint_node_id], (err, row) => {
            db.close();

            if (err) {
                console.error('Error fetching checkpoint:', err);
                return res.status(500).json({ error: err.message });
            }

            const checkpointState = row && row.state_update_json
                ? JSON.parse(row.state_update_json)
                : {};

            res.json({
                new_session_id: newSessionId,
                parent_session_id: parentSessionId,
                checkpoint_node_id: checkpoint_node_id,
                checkpoint_state: checkpointState,
                message: 'Branch created successfully'
            });
        });
    });
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
    console.log("  Available endpoints:");
    console.log("    GET  /api/sessions");
    console.log("    GET  /api/sessions/:id");
    console.log("    GET  /api/sessions/:id/nodes");
    console.log("    POST /api/sessions/:id/branch");
    console.log("    POST /api/sessions/:id/resume");
});

// Attach Socket.IO to the same HTTP server
const io = new Server(httpServer, {
    cors: { origin: "*" }
});

console.log("✓ WebSocket server attached to port 3001");

// ============================================
// WEBSOCKET LOGIC (Existing)
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

                    // Spawn Python process to run LangGraph
                    const pythonProcess = spawn("python3", [
                        path.join(__dirname, "langgraph_agent.py")
                    ], {
                        cwd: path.join(__dirname, "..") // Run from project root so it finds reasoning_trace.json
                    });

                    pythonProcess.stderr.on('data', (data) => {
                        console.error(`LangGraph Error: ${data}`);
                    });

                    pythonProcess.on('close', (code) => {
                        console.log(`LangGraph processing completed with code ${code}`);

                        // Now emit events to dashboard
                        steps.forEach(step => {
                            if (!processedSteps.has(step.step)) {
                                processedSteps.add(step.step);

                                const event = {
                                    type: 'reasoning',
                                    step: step.step,
                                    thought: step.thought,
                                    file: step.file_examined,
                                    decision: step.decision,
                                    alternatives: step.alternatives_considered
                                };

                                console.log(`Emitting step ${step.step}`);
                                io.emit("agent-event", event);
                            }
                        });
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

    socket.on("disconnect", () => {
        console.log("Dashboard disconnected");
    });
});
