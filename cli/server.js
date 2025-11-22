const { Server } = require("socket.io");
const { spawn } = require("child_process");
const path = require("path");

const io = new Server(3001, {
    cors: {
        origin: "*", // Allow dashboard to connect
    },
});

console.log("Relay Server started on port 3001");

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
