#!/bin/bash

# Start Antigravity Brain Monitor (Auto-Detect Mode)
# This captures Antigravity's reasoning from its brain directory

echo "🧠 Antigravity Brain Monitor"
echo "===================================="
echo ""

# Get output path
OUTPUT_PATH="${1:-$(cd "$(dirname "$0")/.." && pwd)/reasoning_trace.json}"
PROJECT_FILTER="${2:-Shaurya-Portfolio}"

echo "✓ Output: $OUTPUT_PATH"
echo "✓ Project Filter: $PROJECT_FILTER"
echo ""
echo "🚀 Starting monitor (Auto-detecting latest session for $PROJECT_FILTER)..."
echo "   (Ctrl+C to stop)"
echo ""

# Start the monitor
python3 "$(dirname "$0")/antigravity_brain_monitor.py" --output "$OUTPUT_PATH" --project-filter "$PROJECT_FILTER"
