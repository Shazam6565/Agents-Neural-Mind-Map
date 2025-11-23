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
          alternatives: node.state.alternatives || [],
          isBranch: node.parent_node_id !== null && index === 0 // Simple heuristic for branch start
        }
      }));

      const flowEdges: Edge[] = nodeData
        .filter((node: any) => node.parent_node_id !== null)
        .map((node: any) => ({
          id: `e${node.parent_node_id}-${node.id}`,
          source: node.parent_node_id.toString(),
          target: node.id.toString(),
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#3b82f6', strokeWidth: 2 }
        }));

      setNodes(flowNodes);
      setEdges(flowEdges);
      setCurrentSessionId(sessionId);

      console.log(`Loaded session ${sessionId}: ${flowNodes.length} nodes`);

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

  return (
    <div className="flex h-screen bg-[#0a0a0f] text-white overflow-hidden font-sans selection:bg-blue-500/30">
      {/* Background Gradient */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-900/20 via-gray-900/0 to-gray-900/0 pointer-events-none" />

      <div className="relative z-10 flex h-full w-full">
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
