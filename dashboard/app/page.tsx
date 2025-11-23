'use client';

import { useState, useEffect, useCallback } from 'react';
import { useNodesState, useEdgesState, Node, Edge } from 'reactflow';
import SessionHistory from '@/components/SessionHistory';
import MindMap from '@/components/MindMap';
import { Brain } from 'lucide-react';

export default function Home() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [agentStatus, setAgentStatus] = useState<string>('IDLE');

  // Agent Control Handlers
  const handlePause = async () => {
    try {
      await fetch('http://localhost:3001/api/agent/pause', { method: 'POST' });
    } catch (error) {
      console.error('Failed to pause agent:', error);
    }
  };

  const handleResume = async () => {
    try {
      await fetch('http://localhost:3001/api/agent/resume', { method: 'POST' });
    } catch (error) {
      console.error('Failed to resume agent:', error);
    }
  };

  const handleRollback = async (step: number) => {
    if (!currentSessionId) return;
    try {
      setAgentStatus('ROLLING_BACK');
      await fetch('http://localhost:3001/api/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: currentSessionId, step })
      });
      // Reload the session
      await loadSessionNodes(currentSessionId);
      setAgentStatus('IDLE');
    } catch (error) {
      console.error('Failed to rollback:', error);
      setAgentStatus('IDLE');
    }
  };

  // Load session nodes when a session is selected
  const loadSessionNodes = useCallback(async (sessionId: string) => {
    try {
      const response = await fetch(
        `http://localhost:3001/api/sessions/${sessionId}/nodes`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const nodeData = await response.json();

      // Convert to React Flow format
      const flowNodes: Node[] = nodeData.map((node: any, index: number) => ({
        id: node.id.toString(),
        type: 'custom', // Use our new CustomNode
        position: { x: 0, y: 0 }, // Layout will be handled by dagre
        data: {
          label: node.node_name,
          step: node.state.step || index + 1,
          thought: node.state.thought || '',
          decision: node.state.decision || '',
          file: node.state.file_examined || '',
          files_modified: node.state.files_modified || [],
          alternatives: node.state.alternatives || [],
          status: node.state.status,
          commit_sha: node.commit_sha || null,
          step_id: node.step_id || null,
          isBranch: node.parent_node_id !== null && index === 0
        }
      }));

      // Create edges: Connect nodes sequentially based on step order
      const flowEdges: Edge[] = [];
      for (let i = 0; i < flowNodes.length - 1; i++) {
        flowEdges.push({
          id: `e${flowNodes[i].id}-${flowNodes[i + 1].id}`,
          source: flowNodes[i].id,
          target: flowNodes[i + 1].id,
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#3b82f6', strokeWidth: 2 }
        });
      }

      setNodes(flowNodes);
      setEdges(flowEdges);
      setCurrentSessionId(sessionId);

      console.log(`Loaded session ${sessionId}: ${flowNodes.length} nodes, ${flowEdges.length} edges`);

    } catch (error) {
      console.error('Error loading session nodes:', error);
      alert('Failed to load session. Check console for details.');
    }
  }, [setNodes, setEdges]);

  // Listen for refresh events from other components
  useEffect(() => {
    const handleRefresh = () => {
      // Trigger session history refresh
      window.dispatchEvent(new CustomEvent('refresh-sessions'));
    };

    window.addEventListener('refresh-sessions', handleRefresh);
    return () => window.removeEventListener('refresh-sessions', handleRefresh);
  }, []);

  // Listen for agent status changes via WebSocket
  useEffect(() => {
    // We need to access the socket instance. Since it's not globally available here, 
    // we might need to rely on a global event or a context.
    // For this phase, let's assume we can listen to a custom event dispatched by a global socket listener 
    // or we can just poll/connect here. 
    // Ideally, we should have a SocketContext. 
    // But given the current structure, let's add a simple socket listener here or assume the socket is managed elsewhere.
    // Wait, the previous code didn't have a socket connection in page.tsx. 
    // Let's add a simple socket connection here for status updates.

    // Dynamic import to avoid SSR issues with socket.io-client if needed, but standard import is usually fine in useEffect
    const io = require('socket.io-client');
    const socket = io('http://localhost:3001');

    socket.on('connect', () => {
      console.log('Dashboard connected to WebSocket');
    });

    socket.on('agent-event', (message: any) => {
      if (message.event_type === 'agent.status_changed') {
        setAgentStatus(message.payload.status);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div className="flex h-screen bg-[#0a0a0f] text-white overflow-hidden font-sans selection:bg-blue-500/30">
      {/* Background Gradient */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-900/20 via-gray-900/0 to-gray-900/0 pointer-events-none" />

      {/* Status Banner */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {/* Connection Status */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-xs font-medium text-gray-400">
          <div className={`w-2 h-2 rounded-full ${agentStatus !== 'IDLE' ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
          BRAIN MONITOR {agentStatus !== 'IDLE' ? 'ACTIVE' : 'READY'}
        </div>

        {/* Agent Activity Status */}
        {agentStatus !== 'IDLE' && (
          <div className={`px-4 py-2 rounded-lg backdrop-blur-md border text-sm font-bold shadow-xl animate-in slide-in-from-right duration-300
              ${agentStatus === 'RUNNING' ? 'bg-blue-500/20 border-blue-500/50 text-blue-200' : ''}
              ${agentStatus === 'PAUSED' ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-200' : ''}
              ${agentStatus === 'ROLLING_BACK' ? 'bg-red-500/20 border-red-500/50 text-red-200' : ''}
          `}>
            <div className="flex items-center gap-3">
              {agentStatus === 'RUNNING' && <div className="w-2 h-2 bg-blue-400 rounded-full animate-ping" />}
              {agentStatus === 'PAUSED' && <div className="w-2 h-2 bg-yellow-400 rounded-full" />}
              {agentStatus === 'ROLLING_BACK' && <div className="w-2 h-2 bg-red-400 rounded-full animate-spin" />}

              <span>
                {agentStatus === 'RUNNING' && 'PROCESSING THOUGHTS...'}
                {agentStatus === 'PAUSED' && 'BRAIN PAUSED'}
                {agentStatus === 'ROLLING_BACK' && 'REWINDING MEMORY...'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Control Bar */}
      {currentSessionId && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
          <div className="flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-xl border border-white/10 rounded-full shadow-2xl">
            <button
              onClick={handlePause}
              disabled={agentStatus === 'PAUSED'}
              className="px-4 py-1.5 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/50 
                       rounded-full text-xs font-bold text-yellow-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ⏸ PAUSE
            </button>
            <button
              onClick={handleResume}
              disabled={agentStatus === 'RUNNING'}
              className="px-4 py-1.5 bg-green-500/20 hover:bg-green-500/30 border border-green-500/50 
                       rounded-full text-xs font-bold text-green-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ▶ RESUME
            </button>
            <div className="w-px h-6 bg-white/10" />
            <button
              onClick={() => {
                const step = prompt('Rollback to step number:');
                if (step) handleRollback(parseInt(step));
              }}
              className="px-4 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 
                       rounded-full text-xs font-bold text-red-200 transition-all"
            >
              ↩ ROLLBACK
            </button>
          </div>
        </div>
      )}

      <div className="relative z-10 flex h-full w-full pt-4"> {/* Added pt-4 to account for banner if needed, or just let it overlay */}
        <SessionHistory
          onSelectSession={loadSessionNodes}
          currentSessionId={currentSessionId}
        />

        <div className="flex-1 relative">
          {currentSessionId ? (
            <MindMap
              currentSessionId={currentSessionId}
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-4 animate-in fade-in zoom-in duration-500">
                <div className="w-24 h-24 bg-gray-800/50 rounded-full flex items-center justify-center mx-auto ring-1 ring-gray-700 shadow-2xl shadow-blue-900/20">
                  <Brain className="w-12 h-12 text-gray-500" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white mb-2">Ready to Explore</h2>
                  <p className="text-gray-400 max-w-md mx-auto">
                    Select a session from the sidebar to visualize the agent's reasoning process in a high-fidelity mind map.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
