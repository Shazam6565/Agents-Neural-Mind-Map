#!/bin/bash

# Start Git Commit Monitor for Antigravity Integration
# This script monitors Git commits in your project and converts them to reasoning traces

PROJECT_PATH="$1"
PROJECT_NAME="${2:-$(basename $PROJECT_PATH)}"

if [ -z "$PROJECT_PATH" ]; then
    echo "Usage: ./start-git-monitor.sh <project_path> [project_name]"
    echo ""
    echo "Example:"
    echo "  ./start-git-monitor.sh /Users/shauryatiwari/Desktop/Hackathon\\ Demo/Shaurya-Portfolio"
    exit 1
fi

# Validate project path
if [ ! -d "$PROJECT_PATH" ]; then
    echo "❌ Error: Project path does not exist: $PROJECT_PATH"
    exit 1
fi

# Check if it's a Git repository
if [ ! -d "$PROJECT_PATH/.git" ]; then
    echo "❌ Error: Not a Git repository: $PROJECT_PATH"
    exit 1
fi

REASONING_TRACE="$PROJECT_PATH/reasoning_trace.json"

echo "🎯 Starting Git Commit Monitor"
echo "================================================"
echo "📁 Project: $PROJECT_NAME"
echo "📂 Path: $PROJECT_PATH"
echo "📝 Reasoning Trace: $REASONING_TRACE"
echo ""
echo "💡 How it works:"
echo "   1. Make commits in your project as you code"
echo "   2. This monitor captures them as reasoning steps"
echo "   3. Dashboard visualizes them in real-time"
echo "   4. Use rollback/branch controls in the dashboard"
echo ""
echo "🚀 Starting monitor (Ctrl+C to stop)..."
echo ""

# Start the monitor
python3 git_commit_monitor.py "$PROJECT_PATH" --output "$REASONING_TRACE"
