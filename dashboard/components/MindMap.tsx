'use client';

import { useCallback, useState, useMemo, useEffect } from 'react';
import ReactFlow, {
    Background,
    Controls,
    Node,
    Edge,
    useNodesState,
    useEdgesState,
    Connection,
    addEdge,
    Position,
} from 'reactflow';
import dagre from 'dagre';
import 'reactflow/dist/style.css';
import CustomNode from './CustomNode';
import { GitBranch, X, Play } from 'lucide-react';

interface MindMapProps {
    currentSessionId: string | null;
    nodes: Node[];
    edges: Edge[];
    onNodesChange: any;
    onEdgesChange: any;
}

const nodeTypes = {
    custom: CustomNode,
};

const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    dagreGraph.setGraph({ rankdir: 'TB' });

    nodes.forEach((node) => {
        dagreGraph.setNode(node.id, { width: 250, height: 100 });
    });

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const layoutedNodes = nodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        node.targetPosition = Position.Top;
        node.sourcePosition = Position.Bottom;

        // We are shifting the dagre node position (anchor=center center) to the top left
        // so it matches the React Flow node anchor point (top left).
        node.position = {
            x: nodeWithPosition.x - 125,
            y: nodeWithPosition.y - 50,
        };

        return node;
    });

    return { nodes: layoutedNodes, edges };
};

export default function MindMap({
    currentSessionId,
    nodes: initialNodes,
    edges: initialEdges,
    onNodesChange,
    onEdgesChange
}: MindMapProps) {

    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const [layoutedNodes, setLayoutedNodes] = useState<Node[]>([]);
    const [layoutedEdges, setLayoutedEdges] = useState<Edge[]>([]);

    // Apply layout whenever nodes or edges change
    useEffect(() => {
        const { nodes: lNodes, edges: lEdges } = getLayoutedElements(
            initialNodes.map(n => ({ ...n, type: 'custom' })), // Force custom type
            initialEdges
        );
        setLayoutedNodes(lNodes);
        setLayoutedEdges(lEdges);
    }, [initialNodes, initialEdges]);

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
        <div className="h-screen w-full bg-[#0a0a0f]">
            <ReactFlow
                nodes={layoutedNodes}
                edges={layoutedEdges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={onNodeClick}
                nodeTypes={nodeTypes}
                fitView
                className="bg-[#0a0a0f]"
            >
                <Background color="#1f2937" gap={24} size={1} />
                <Controls className="!bg-gray-800 !border-gray-700 !fill-gray-400" />
            </ReactFlow>

            {selectedNode && (
                <div className="absolute top-6 right-6 w-80 bg-gray-900/90 backdrop-blur-xl border border-gray-700/50 rounded-2xl p-5 shadow-2xl animate-in fade-in slide-in-from-right-4 duration-200">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h3 className="text-white font-bold text-lg">Node Details</h3>
                            <span className="text-xs text-gray-500 uppercase tracking-wider font-medium">
                                Step {selectedNode.data.step}
                            </span>
                        </div>
                        <button
                            onClick={() => setSelectedNode(null)}
                            className="text-gray-400 hover:text-white transition-colors p-1 hover:bg-gray-800 rounded-full"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="space-y-4 mb-6">
                        <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/30">
                            <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold block mb-1">Thought</span>
                            <p className="text-gray-200 text-sm leading-relaxed">{selectedNode.data.thought}</p>
                        </div>

                        {selectedNode.data.decision && (
                            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/30">
                                <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold block mb-1">Decision</span>
                                <p className="text-gray-200 text-sm leading-relaxed">{selectedNode.data.decision}</p>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={handleBranch}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-2.5 px-4 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40 hover:-translate-y-0.5"
                    >
                        <GitBranch className="w-4 h-4" />
                        Branch from here
                    </button>
                </div>
            )}
        </div>
    );
}
