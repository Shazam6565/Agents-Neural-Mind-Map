#!/bin/bash

# Mind Map Server - Project Switcher
# This script helps you run the Mind Map server for different projects

echo "🎯 Mind Map Visualizer - Project Configuration"
echo "================================================"
echo ""

# Check if project path is provided
if [ -z "$1" ]; then
    echo "Usage: ./run-for-project.sh <project_path> [project_name]"
    echo ""
    echo "Example:"
    echo "  ./run-for-project.sh /Users/shauryatiwari/Desktop/MyProject \"My Project\""
    echo ""
    echo "Or set environment variables:"
    echo "  WORKSPACE_PATH=/path/to/project ./run-for-project.sh"
    exit 1
fi

PROJECT_PATH="$1"
PROJECT_NAME="${2:-$(basename "$PROJECT_PATH")}"

# Validate project path exists
if [ ! -d "$PROJECT_PATH" ]; then
    echo "❌ Error: Project path does not exist: $PROJECT_PATH"
    exit 1
fi

# Set paths
WORKSPACE_PATH="$PROJECT_PATH"
REASONING_TRACE_PATH="$PROJECT_PATH/reasoning_trace.json"
DB_PATH="$PROJECT_PATH/.mindmap/agent_mindmap.db"

# Create .mindmap directory if it doesn't exist
mkdir -p "$PROJECT_PATH/.mindmap"

echo "📁 Project: $PROJECT_NAME"
echo "📂 Workspace: $WORKSPACE_PATH"
echo "📝 Reasoning Trace: $REASONING_TRACE_PATH"
echo "💾 Database: $DB_PATH"
echo ""

# Check if reasoning trace exists
if [ ! -f "$REASONING_TRACE_PATH" ]; then
    echo "⚠️  Warning: reasoning_trace.json not found at $REASONING_TRACE_PATH"
    echo "   The server will wait for this file to be created by Antigravity."
    echo ""
fi

# Initialize database if needed
if [ ! -f "$DB_PATH" ]; then
    echo "🔧 Initializing database..."
    DB_PATH="$DB_PATH" python3 database/init_db.py
    echo ""
fi

echo "🚀 Starting Mind Map Server..."
echo "   Dashboard will be available at: http://localhost:3000"
echo "   API Server will be available at: http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start the Brain Monitor in the background
echo "🧠 Starting Brain Monitor for $PROJECT_NAME..."
./start-brain-monitor.sh "$REASONING_TRACE_PATH" "$PROJECT_NAME" &
MONITOR_PID=$!

# Function to kill monitor on exit
cleanup() {
    echo ""
    echo "🛑 Stopping services..."
    kill $MONITOR_PID
    exit
}
trap cleanup SIGINT

# Run the server with environment variables
WORKSPACE_PATH="$WORKSPACE_PATH" \
REASONING_TRACE_PATH="$REASONING_TRACE_PATH" \
DB_PATH="$DB_PATH" \
node server.js
