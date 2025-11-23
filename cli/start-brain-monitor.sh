#!/bin/bash

# Start Antigravity Brain Monitor
# This captures Antigravity's reasoning from its brain directory

echo "🧠 Antigravity Brain Monitor Setup"
echo "===================================="
echo ""

# Get the current Antigravity session ID
BRAIN_DIR="$HOME/.gemini/antigravity/brain"

if [ ! -d "$BRAIN_DIR" ]; then
    echo "❌ Error: Antigravity brain directory not found at: $BRAIN_DIR"
    exit 1
fi

# List available sessions
echo "📁 Available Antigravity sessions:"
ls -t "$BRAIN_DIR" | head -5

echo ""
echo "Enter the session ID you want to monitor:"
echo "(Usually the most recent one, or check your other Antigravity window)"
read -p "Session ID: " SESSION_ID

if [ -z "$SESSION_ID" ]; then
    echo "❌ No session ID provided"
    exit 1
fi

BRAIN_SESSION="$BRAIN_DIR/$SESSION_ID"

if [ ! -d "$BRAIN_SESSION" ]; then
    echo "❌ Error: Session directory not found: $BRAIN_SESSION"
    exit 1
fi

# Get output path
OUTPUT_PATH="${1:-/Users/shauryatiwari/Desktop/Hackathon Demo/Shaurya-Portfolio/reasoning_trace.json}"

echo ""
echo "✓ Monitoring session: $SESSION_ID"
echo "✓ Output: $OUTPUT_PATH"
echo ""
echo "💡 This will capture:"
echo "   • Task checklist items from task.md"
echo "   • Design decisions from implementation_plan.md"
echo "   • Completed work from walkthrough.md"
echo ""
echo "🚀 Starting monitor (Ctrl+C to stop)..."
echo ""

# Start the monitor
python3 "$(dirname "$0")/antigravity_brain_monitor.py" "$BRAIN_SESSION" --output "$OUTPUT_PATH"
