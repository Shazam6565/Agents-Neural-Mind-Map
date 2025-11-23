'use client';

import { useCallback, useState } from 'react';
import ReactFlow, {
    Background,
    Controls,
    Node,
    Edge,
    useNodesState,
    useEdgesState,
    Connection,
    addEdge,
} from 'reactflow';
import 'reactflow/dist/style.css';

interface MindMapProps {
    currentSessionId: string | null;
    nodes: Node[];
    edges: Edge[];
    onNodesChange: any;
    onEdgesChange: any;
}

export default function MindMap({
    currentSessionId,
    nodes,
    edges,
    onNodesChange,
    onEdgesChange
}: MindMapProps) {

    const [selectedNode, setSelectedNode] = useState<Node | null>(null);

    // Handle node click for rollback
    const onNodeClick = useCallback(async (event: React.MouseEvent, node: Node) => {
        setSelectedNode(node);

        const confirmRollback = window.confirm(
            `Branch from this checkpoint?\n\n` +
            `Node: ${node.data.label}\n` +
            `Step: ${node.data.step}\n\n` +
            `This will create a new session starting from this point.`
        );

        if (!confirmRollback || !currentSessionId) return;

        const newPrompt = prompt(
            'Enter a description for this branch:',
            `Branch from step ${node.data.step}`
        );

        if (!newPrompt) return;

        try {
            const response = await fetch(
                `http://localhost:3001/api/sessions/${currentSessionId}/branch`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        checkpoint_node_id: node.id,
                        prompt: newPrompt
                    })
                }
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();

            alert(
                `✓ Branch created successfully!\n\n` +
                `New Session ID: ${result.new_session_id.substring(0, 8)}...\n` +
                `Parent Session: ${result.parent_session_id.substring(0, 8)}...`
            );

            // Optionally, trigger a refresh of the session history
            window.dispatchEvent(new CustomEvent('refresh-sessions'));

        } catch (error) {
            console.error('Error creating branch:', error);
            alert('Failed to create branch. Check console for details.');
        }
    }, [currentSessionId]);

    return (
        <div className="h-screen w-full">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={onNodeClick}
                fitView
                className="bg-gray-950"
            >
                <Background color="#333" gap={16} />
                <Controls />
            </ReactFlow>

            {selectedNode && (
                <div className="absolute top-4 right-4 bg-gray-800 border border-gray-700 rounded-lg p-4 max-w-sm">
                    <h3 className="text-white font-bold mb-2">Selected Node</h3>
                    <div className="text-gray-300 text-sm space-y-1">
                        <p><span className="text-gray-400">Step:</span> {selectedNode.data.step}</p>
                        <p><span className="text-gray-400">Thought:</span> {selectedNode.data.thought}</p>
                        <p><span className="text-gray-400">Decision:</span> {selectedNode.data.decision}</p>
                    </div>
                    <button
                        onClick={() => setSelectedNode(null)}
                        className="mt-3 text-gray-400 hover:text-white text-sm"
                    >
                        Close
                    </button>
                </div>
            )}
        </div>
    );
}
