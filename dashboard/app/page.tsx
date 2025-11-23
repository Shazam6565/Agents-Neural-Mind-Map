'use client';

import { useState, useEffect, useCallback } from 'react';
import { useNodesState, useEdgesState, Node, Edge } from 'reactflow';
import SessionHistory from '@/components/SessionHistory';
import MindMap from '@/components/MindMap';

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
        type: 'default',
        position: { x: index * 250, y: 100 },
        data: {
          label: node.node_name,
          step: node.state.step || index + 1,
          thought: node.state.thought || '',
          decision: node.state.decision || '',
          file: node.state.file_examined || '',
          alternatives: node.state.alternatives || []
        }
      }));

      const flowEdges: Edge[] = nodeData
        .filter((node: any) => node.parent_node_id !== null)
        .map((node: any) => ({
          id: `e${node.parent_node_id}-${node.id}`,
          source: node.parent_node_id.toString(),
          target: node.id.toString(),
          type: 'smoothstep',
          animated: true
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
    <div className="flex h-screen bg-gray-950">
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
            <div className="text-center text-gray-400">
              <p className="text-xl mb-2">No session selected</p>
              <p className="text-sm">Select a session from the sidebar to view its mind map</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
