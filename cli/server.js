const { Server } = require("socket.io");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const io = new Server(3001, {
    cors: {
        origin: "*",
    },
});

console.log("Relay Server started on port 3001");

const reasoningTracePath = path.join(__dirname, "../reasoning_trace.json");
console.log(`Watching for reasoning traces at: ${reasoningTracePath}`);

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
