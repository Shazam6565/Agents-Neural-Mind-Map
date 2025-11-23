'use client';

import React, { useEffect, useCallback } from 'react';
import ReactFlow, {
    Node,
    Edge,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    addEdge,
    Connection,
    MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { AgentEvent } from '@/types/mindmap';

interface MindMapProps {
    events: AgentEvent[];
}

const initialNodes: Node[] = [
    {
        id: 'start',
        type: 'input',
        data: { label: 'Agent Started' },
        position: { x: 250, y: 0 },
    },
];

const nodeTypes = {
    // We can define custom node types here later
};

export default function MindMap({ events }: MindMapProps) {
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    // Transform events into nodes/edges
    useEffect(() => {
        if (events.length === 0) return;

        const newNodes: Node[] = [];
        const newEdges: Edge[] = [];

        // Simple layout strategy: vertical stack for now
        // In a real app, use dagre or similar for auto-layout
        let yOffset = 100;

        events.forEach((event, index) => {
            const nodeId = (event.id || `step-${event.step || index}`).toString();
            const content = event.content || event.thought || event.decision || 'No content';

            // Create Node
            newNodes.push({
                id: nodeId,
                type: 'default', // or custom based on event.type
                data: {
                    label: `${event.type.toUpperCase()}: ${content.substring(0, 20)}...`,
                    fullContent: content
                },
                position: { x: 250, y: yOffset },
                style: {
                    background: getNodeColor(event.type),
                    color: '#fff',
                    border: '1px solid #333',
                    width: 200
                }
            });

            // Create Edge (connect to previous node or parent)
            // For this MVP, just connect sequentially
            const prevEvent = events[index - 1];
            const sourceId = index === 0 ? 'start' : (prevEvent.id || `step-${prevEvent.step || index - 1}`).toString();

            newEdges.push({
                id: `e-${sourceId}-${nodeId}`,
                source: sourceId,
                target: nodeId,
                animated: true,
                markerEnd: { type: MarkerType.ArrowClosed },
            });

            yOffset += 100;
        });

        // Merge with existing nodes (simplified: just replace for now to avoid duplication logic complexity in MVP)
        // In production, we'd append carefully.
        setNodes((nds) => [...initialNodes, ...newNodes]);
        setEdges((eds) => [...newEdges]);

    }, [events, setNodes, setEdges]);

    const onConnect = useCallback(
        (params: Connection) => setEdges((eds) => addEdge(params, eds)),
        [setEdges]
    );

    return (
        <div style={{ width: '100%', height: '100%' }}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                nodeTypes={nodeTypes}
                fitView
            >
                <Controls />
                <Background />
            </ReactFlow>
        </div>
    );
}

function getNodeColor(type: string) {
    switch (type) {
        case 'reasoning': return '#3b82f6'; // blue
        case 'decision': return '#8b5cf6'; // purple
        case 'tool_call': return '#f59e0b'; // amber
        case 'code_edit': return '#10b981'; // green
        case 'error': return '#ef4444'; // red
        default: return '#6b7280'; // gray
    }
}
