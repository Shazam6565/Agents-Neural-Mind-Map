const { Server } = require("socket.io");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const io = new Server(3001, {
    cors: {
        origin: "*", // Allow dashboard to connect
    },
});

console.log("Relay Server started on port 3001");

// Watch for changes in reasoning_trace.json
const reasoningTracePath = path.join(__dirname, "../reasoning_trace.json");
console.log(`Watching for reasoning traces at: ${reasoningTracePath}`);

// Keep track of processed steps to avoid re-emitting old ones
let processedSteps = new Set();

// Initial read to populate processedSteps
if (fs.existsSync(reasoningTracePath)) {
    try {
        const content = fs.readFileSync(reasoningTracePath, "utf8");
        const steps = JSON.parse(content);
        steps.forEach(step => processedSteps.add(step.step));
    } catch (e) {
        console.error("Error reading initial reasoning trace:", e);
    }
}

fs.watch(reasoningTracePath, (eventType, filename) => {
    if (eventType === 'change') {
        fs.readFile(reasoningTracePath, 'utf8', (err, data) => {
            if (err) {
                console.error("Error reading reasoning trace:", err);
                return;
            }
            try {
                const steps = JSON.parse(data);
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

                        console.log(`Reasoning Watcher: Emitting step ${step.step}`);
                        io.emit("agent-event", event);
                    }
                });
            } catch (e) {
                console.error("Error parsing reasoning trace JSON:", e);
            }
        });
    }
});

io.on("connection", (socket) => {
    console.log("Dashboard connected");

    // Mocking the agent process for now. 
    // In reality, this would spawn the actual agent command.
    // For the hackathon, we can run the python mock script.

    const pythonScript = path.join(__dirname, "main.py");
    const agentProcess = spawn("python3", [pythonScript]);

    agentProcess.stdout.on("data", (data) => {
        const lines = data.toString().split("\n");
        lines.forEach((line) => {
            if (line.trim()) {
                try {
                    // Try to parse as JSON event
                    const event = JSON.parse(line);
                    socket.emit("agent-event", event);
                } catch (e) {
                    // If not JSON, just emit as log
                    console.log("Agent Log:", line);
                    socket.emit("agent-log", line);
                }
            }
        });
    });

    agentProcess.stderr.on("data", (data) => {
        console.error("Agent Error:", data.toString());
        socket.emit("agent-error", data.toString());
    });

    socket.on("disconnect", () => {
        console.log("Dashboard disconnected");
        agentProcess.kill();
    });
});
