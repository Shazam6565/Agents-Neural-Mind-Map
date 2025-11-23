const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
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

// Get All Sessions - FIXED for frontend schema
app.get('/api/sessions', async (req, res) => {
    try {
        const sessions = await scanSessions();

        // Transform to frontend-expected schema
        const transformed = sessions.map(s => ({
            session_id: s.session_id,
            parent_session_id: null,
            // FIX: Use correct field names
            prompt: s.project_name !== "Unknown Project"
                ? `${s.project_name} - Live Session`
                : `Session ${s.session_id.substring(0, 8)}`,
            created_at: s.last_modified,
            step_count: s.step_count || 0
        }));

        res.json(transformed);
    } catch (error) {
        console.error('Error scanning sessions:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get Nodes from LIVE reasoning_trace.json
app.get('/api/sessions/:id/nodes', async (req, res) => {
    try {
        const sessionId = req.params.id;

        // Try to read LIVE reasoning trace first
        const brainDir = path.join(os.homedir(), '.gemini/antigravity/brain', sessionId);
        const tracePath = path.join(brainDir, 'reasoning_trace.json');

        let steps = [];

        if (fs.existsSync(tracePath)) {
            console.log(`📖 Reading LIVE reasoning trace: ${tracePath}`);
            const traceContent = fs.readFileSync(tracePath, 'utf8');
            const trace = JSON.parse(traceContent);

            // Transform reasoning trace to nodes
            steps = Array.isArray(trace) ? trace : [trace];
        } else {
            // Fallback to session scanner
            console.log(`⚠️  No reasoning trace found, using session scanner`);
            steps = await getSessionSteps(sessionId);
        }

        // Transform to Node format
        const nodes = steps.map((step, index) => ({
            id: index + 1,
            node_name: step.file_examined
                ? `${step.decision || step.thought || 'Step'} (${path.basename(step.file_examined)})`
                : step.decision || step.thought || `Step ${step.step || index + 1}`,
            state: {
                step: step.step || index + 1,
                thought: step.thought || '',
                decision: step.decision || '',
                file_examined: step.file_examined || '',
                files_modified: step.files_modified || (step.file_examined ? [step.file_examined] : []),
                alternatives: step.alternatives_considered || step.alternatives || [],
                status: step.status || 'complete',
                tool_called: step.tool_called || null
            },
            parent_node_id: index > 0 ? index : null,
            step_id: step.step || index + 1
        }));

        console.log(`✓ Returned ${nodes.length} nodes for session ${sessionId}`);
        res.json(nodes);
    } catch (error) {
        console.error('Error fetching session nodes:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// STATE RESTORATION & CONTROL ENDPOINTS
// ==========================================

// Helper to execute Python scripts
const execPython = (scriptName, args = []) => {
    return new Promise((resolve, reject) => {
        const pythonArgs = [path.join(__dirname, scriptName), ...args];
        const process = spawn('python3', pythonArgs);

        let output = '';
        let error = '';

        process.stdout.on('data', (data) => output += data.toString());
        process.stderr.on('data', (data) => error += data.toString());

        process.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(error || `Process exited with code ${code}`));
            } else {
                try {
                    resolve(JSON.parse(output));
                } catch (e) {
                    resolve(output.trim());
                }
            }
        });
    });
};

// POST /api/sessions/:sessionId/rollback - Restore to a specific step
app.post('/api/sessions/:sessionId/rollback', async (req, res) => {
    const { sessionId } = req.params;
    const { targetStep, applyToFilesystem = false } = req.body;

    try {
        console.log(`Rollback requested: session=${sessionId}, step=${targetStep}, apply=${applyToFilesystem}`);

        // 1. Get rollback details from LangGraph
        const rollbackResult = await execPython('langgraph_manager.py', [
            'rollback',
            '--db', DB_PATH,
            '--thread', sessionId,
            '--step', targetStep.toString()
        ]);

        if (!rollbackResult.success) {
            return res.status(400).json({ error: rollbackResult.error || 'Rollback failed' });
        }

        // 2. If preview only, return without applying to filesystem
        if (!applyToFilesystem) {
            return res.json({
                success: true,
                preview: true,
                restored_state: rollbackResult.restored_state,
                files_affected: rollbackResult.files_affected,
                checkpoint_id: rollbackResult.checkpoint_id,
                step_count: rollbackResult.step_count
            });
        }

        // 3. Validate restoration is safe
        const validation = await execPython('validation_service.py', [
            '--workspace', WORKSPACE_PATH,
            '--session-id', sessionId,
            '--target-step', targetStep.toString(),
            '--file-snapshots', JSON.stringify(rollbackResult.restored_state.file_snapshots || {})
        ]);

        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                errors: validation.errors,
                warnings: validation.warnings
            });
        }

        // 4. Apply to filesystem
        const fsResult = await execPython('fs_synchronizer.py', [
            'restore',
            '--workspace', WORKSPACE_PATH,
            '--file-snapshots', JSON.stringify(rollbackResult.restored_state.file_snapshots || {}),
            '--backup-id', rollbackResult.backup_checkpoint_id
        ]);

        // 5. Emit WebSocket event
        io.emit('state-restored', {
            sessionId,
            step: targetStep,
            filesModified: fsResult.files_restored
        });

        res.json({
            success: true,
            restored_step: targetStep,
            files_modified: fsResult.files_restored,
            files_backed_up: fsResult.files_backed_up,
            backup_id: rollbackResult.backup_checkpoint_id,
            conflicts: fsResult.conflicts,
            warnings: validation.warnings
        });

    } catch (error) {
        console.error('Rollback error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/sessions/:sessionId/checkpoints - List all checkpoints
app.get('/api/sessions/:sessionId/checkpoints', async (req, res) => {
    const { sessionId } = req.params;

    try {
        const checkpoints = await execPython('langgraph_manager.py', [
            'get-history',
            '--db', DB_PATH,
            '--thread', sessionId
        ]);

        res.json(checkpoints || []);
    } catch (error) {
        console.error('Error fetching checkpoints:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/sessions/:sessionId/diff/:step - Get diff preview for a step
app.get('/api/sessions/:sessionId/diff/:step', async (req, res) => {
    const { sessionId, step } = req.params;

    try {
        // Get the state for this step
        const rollbackResult = await execPython('langgraph_manager.py', [
            'rollback',
            '--db', DB_PATH,
            '--thread', sessionId,
            '--step', step,
            '--preview-only'
        ]);

        if (!rollbackResult.success) {
            return res.status(404).json({ error: 'Checkpoint not found' });
        }

        const fileSnapshots = rollbackResult.restored_state.file_snapshots || {};
        const diffs = [];

        // Generate diffs for each file
        for (const [filePath, snapshotContent] of Object.entries(fileSnapshots)) {
            try {
                const diffResult = await execPython('fs_synchronizer.py', [
                    'diff',
                    '--workspace', WORKSPACE_PATH,
                    '--file-path', filePath,
                    '--snapshot-content', snapshotContent
                ]);
                diffs.push(diffResult);
            } catch (e) {
                console.error(`Error getting diff for ${filePath}:`, e);
            }
        }

        res.json({
            step: parseInt(step),
            files: diffs,
            total_files: diffs.length,
            modified_files: diffs.filter(d => d.status === 'modified').length
        });

    } catch (error) {
        console.error('Error generating diff:', error);
        res.status(500).json({ error: error.message });
    }
});

// Rollback Endpoint - Remove steps after a certain step number (legacy, simplified version)
app.post('/api/rollback', async (req, res) => {
    const { session_id, step } = req.body;
    try {
        // For now, just acknowledge - we'd need to implement actual rollback in LangGraph
        console.log(`Rollback requested for session ${session_id} to step ${step}`);
        res.json({ success: true, message: `Rolled back to step ${step}` });
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

// WebSocket connection handling
io.on('connection', (socket) => {
    console.log('Dashboard connected via WebSocket');

    socket.on('subscribe-session', (sessionId) => {
        socket.join(`session-${sessionId}`);
        console.log(`Client subscribed to session: ${sessionId}`);
    });

    socket.on('disconnect', () => {
        console.log('Dashboard disconnected');
    });
});

// Broadcast state changes to subscribed clients
const broadcastStateChange = (sessionId, data) => {
    io.to(`session-${sessionId}`).emit('state-update', data);
};

// Start Server
server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📂 Workspace: ${WORKSPACE_PATH}`);
    console.log(`📝 Trace: ${REASONING_TRACE_PATH}`);
    console.log(`💾 DB: ${DB_PATH}`);
});
