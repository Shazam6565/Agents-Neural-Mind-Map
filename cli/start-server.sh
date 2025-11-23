#!/bin/bash

# Simple Server Start Script
# No need to specify project path - discovers all sessions automatically

echo "🧠 AI Agent Mind Map Visualizer"
echo "================================="
echo ""
echo "📡 Starting server..."
echo "   Dashboard: http://localhost:3000"
echo "   API: http://localhost:3001"
echo ""
echo "💡 The dashboard will show all Antigravity sessions"
echo "   Select a session to view its mind map"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Start the server
node "$(dirname "$0")/server.js"
