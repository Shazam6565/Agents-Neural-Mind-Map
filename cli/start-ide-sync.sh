#!/bin/bash

# Start IDE Sync Daemon
# Monitors checkpoint changes and syncs workspace files

WORKSPACE_PATH="${1:-/Users/shauryatiwari/Desktop/Hackathon Demo/Shaurya-Portfolio}"
DB_PATH="${2:-$WORKSPACE_PATH/.mindmap/agent_mindmap.db}"
INTERVAL="${3:-5}"

echo "🔄 Starting IDE State Sync Daemon"
echo "   Workspace: $WORKSPACE_PATH"
echo "   Database: $DB_PATH"
echo "   Poll Interval: ${INTERVAL}s"
echo ""
echo "This daemon will:"
echo "  • Monitor checkpoint changes every ${INTERVAL} seconds"
echo "  • Restore files when rollback is detected"
echo "  • Create backups in .backup/ directory"
echo "  • Log all changes to mindmap.log"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Make executable
chmod +x "$(dirname "$0")/ide_sync_daemon.py"

# Run daemon
python3 "$(dirname "$0")/ide_sync_daemon.py" \
    --workspace "$WORKSPACE_PATH" \
    --db "$DB_PATH" \
    --interval "$INTERVAL"
