const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Configuration
const PORT = 3001;
const WORKSPACE_PATH = process.env.WORKSPACE_PATH || path.join(__dirname, '../test-workspace');
const REASONING_TRACE_PATH = process.env.REASONING_TRACE_PATH || path.join(WORKSPACE_PATH, 'reasoning_trace.json');
const DB_PATH = path.join(WORKSPACE_PATH, '.mindmap', 'agent_mindmap.db');

// Ensure DB directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize Express
const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

// LangGraph Manager Helper
const runLangGraph = (action, args = {}) => {
    return new Promise((resolve, reject) => {
        const pythonArgs = [
            path.join(__dirname, 'langgraph_manager.py'),
            action,
            '--db', DB_PATH,
            '--thread', 'main-thread' // Single thread for now
        ];

        if (args.step) pythonArgs.push('--step', args.step.toString());

        const process = spawn('python3', pythonArgs);

        // Write data to stdin if provided
        if (args.data) {
            process.stdin.write(JSON.stringify(args.data));
            process.stdin.end();
        }

        let output = '';
        let error = '';

        process.stdout.on('data', (data) => output += data.toString());
        process.stderr.on('data', (data) => error += data.toString());

        process.on('close', (code) => {
            if (code !== 0) {
                console.error(`LangGraph Error (${action}):`, error);
                reject(new Error(error));
            } else {
                try {
                    // Try to parse JSON if the output looks like JSON (for 'get')
                    if (action === 'get') {
                        resolve(JSON.parse(output));
                    } else {
                        resolve(output.trim());
                    }
                } catch (e) {
                    resolve(output.trim());
                }
            }
        });
    });
};

// --- API Endpoints ---

// Helper to run session scanner
const scanSessions = () => {
    return new Promise((resolve, reject) => {
        const process = spawn('python3', [
            path.join(__dirname, 'session_scanner.py'),
            'list'
        ]);

        let output = '';
        let error = '';

        process.stdout.on('data', (data) => output += data.toString());
        process.stderr.on('data', (data) => error += data.toString());

        process.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(error));
            } else {
                try {
                    resolve(JSON.parse(output));
                } catch (e) {
                    reject(e);
                }
            }
        });
    });
};

// Get session steps
const getSessionSteps = (sessionId) => {
    return new Promise((resolve, reject) => {
        const process = spawn('python3', [
            path.join(__dirname, 'session_scanner.py'),
            'get-steps',
            '--session-id', sessionId
        ]);

        let output = '';
        let error = '';

        process.stdout.on('data', (data) => output += data.toString());
        process.stderr.on('data', (data) => error += data.toString());

        process.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(error));
            } else {
                try {
                    resolve(JSON.parse(output));
                } catch (e) {
                    reject(e);
                }
            }
        });
    });
};

// Get All Sessions
app.get('/api/sessions', async (req, res) => {
    try {
        const sessions = await scanSessions();
        res.json(sessions);
    } catch (error) {
        console.error('Error scanning sessions:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get Nodes (Steps) for a specific session
app.get('/api/sessions/:id/nodes', async (req, res) => {
    try {
        const sessionId = req.params.id;
        const steps = await getSessionSteps(sessionId);

        // Transform to Node format expected by Frontend
        const nodes = steps.map((step, index) => ({
            id: index + 1,
            node_name: step.decision || `Step ${step.step}`,
            state: {
                step: step.step,
                thought: step.thought,
                decision: step.decision,
                file_examined: step.file_examined,
                alternatives: step.alternatives_considered || [],
                status: step.status
            },
            parent_node_id: index > 0 ? index : null,
            step_id: step.step
        }));

        res.json(nodes);
    } catch (error) {
        console.error('Error fetching session nodes:', error);
        res.status(500).json({ error: error.message });
    }
});

// Rollback Endpoint
app.post('/api/rollback', async (req, res) => {
    const { step } = req.body;
    try {
        await runLangGraph('rollback', { step });
        io.emit('refresh-sessions'); // Tell frontend to reload
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- File Watcher ---

let processedSteps = new Set();
let isProcessing = false;

const processFileChange = async () => {
    if (isProcessing) return;
    isProcessing = true;

    try {
        if (!fs.existsSync(REASONING_TRACE_PATH)) return;

        const data = await fs.promises.readFile(REASONING_TRACE_PATH, 'utf8');
        if (!data.trim()) return;

        const steps = JSON.parse(data);
        const newSteps = steps.filter(step => !processedSteps.has(step.step));

        if (newSteps.length > 0) {
            console.log(`Processing ${newSteps.length} new steps...`);

            // Notify Dashboard: Running
            io.emit('agent-status', { status: 'RUNNING' });

            for (const step of newSteps) {
                if (!processedSteps.has(step.step)) {
                    processedSteps.add(step.step);

                    // Add to LangGraph
                    await runLangGraph('add', { data: step });

                    // Notify Dashboard: New Step
                    io.emit('new-step', step);
                }
            }

            // Notify Dashboard: Idle
            io.emit('agent-status', { status: 'IDLE' });
        }
    } catch (error) {
        console.error("Error processing file change:", error);
    } finally {
        isProcessing = false;
    }
};

// Start Watcher
let fsWatcher;
const startWatcher = () => {
    if (fsWatcher) {
        try {
            fsWatcher.close();
        } catch (e) {
            // Ignore close errors
        }
    }

    if (!fs.existsSync(REASONING_TRACE_PATH)) {
        setTimeout(startWatcher, 1000);
        return;
    }

    fsWatcher = fs.watch(REASONING_TRACE_PATH, (eventType) => {
        if (eventType === 'rename') {
            setTimeout(() => {
                startWatcher();
                processFileChange();
            }, 100);
        } else {
            processFileChange();
        }
    });
    console.log("✓ File watcher started");
};

startWatcher();

// Start Server
server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📂 Workspace: ${WORKSPACE_PATH}`);
    console.log(`📝 Trace: ${REASONING_TRACE_PATH}`);
    console.log(`💾 DB: ${DB_PATH}`);
});
