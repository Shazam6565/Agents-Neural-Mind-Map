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

    // Handle node click just for selection
    const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
        setSelectedNode(node);
    }, []);

    // Handle branch creation
    const handleBranch = async () => {
        if (!selectedNode || !currentSessionId) return;

        const newPrompt = prompt(
            'Enter a description for this branch:',
            `Branch from step ${selectedNode.data.step}`
        );

        if (!newPrompt) return;

        try {
            const response = await fetch(
                `http://localhost:3001/api/sessions/${currentSessionId}/branch`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        checkpoint_node_id: selectedNode.id,
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

            // Trigger a refresh of the session history
            window.dispatchEvent(new CustomEvent('refresh-sessions'));
            setSelectedNode(null);

        } catch (error) {
            console.error('Error creating branch:', error);
            alert('Failed to create branch. Check console for details.');
        }
    };

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
                <div className="absolute top-4 right-4 bg-gray-800 border border-gray-700 rounded-lg p-4 max-w-sm shadow-xl">
                    <div className="flex justify-between items-start mb-4">
                        <h3 className="text-white font-bold">Selected Node</h3>
                        <button
                            onClick={() => setSelectedNode(null)}
                            className="text-gray-400 hover:text-white"
                        >
                            ✕
                        </button>
                    </div>

                    <div className="text-gray-300 text-sm space-y-2 mb-4">
                        <p><span className="text-gray-500 font-medium">Step:</span> {selectedNode.data.step}</p>
                        <p><span className="text-gray-500 font-medium">Thought:</span> {selectedNode.data.thought}</p>
                        <p><span className="text-gray-500 font-medium">Decision:</span> {selectedNode.data.decision}</p>
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={handleBranch}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 px-3 rounded transition-colors flex items-center justify-center gap-2"
                        >
                            <span>⑂</span> Branch from here
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
