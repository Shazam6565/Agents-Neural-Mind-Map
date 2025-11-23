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
import { GitBranch, X, Play, RotateCcw, Loader2 } from 'lucide-react';
import { wsClient } from '@/lib/websocket-client';

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
    const [isRollingBack, setIsRollingBack] = useState(false);

    // WebSocket Integration
    useEffect(() => {
        wsClient.connect();

        wsClient.on('state.rollback_completed', (msg: any) => {
            console.log('Rollback completed:', msg);
            setIsRollingBack(false);
            // Trigger session refresh
            window.dispatchEvent(new CustomEvent('refresh-sessions'));
            // Also trigger node refresh for current session if applicable
            if (currentSessionId) {
                // In a real app, we might want a more direct way to trigger parent refresh
                // For now, relying on the parent component to potentially listen or polling
                // But let's at least clear selection
                setSelectedNode(null);
            }
        });

        wsClient.on('branch.created', (msg: any) => {
            console.log('Branch created:', msg);
            alert(`Branch "${msg.name}" created successfully!`);
            window.dispatchEvent(new CustomEvent('refresh-sessions'));
            setSelectedNode(null);
        });

        wsClient.on('system.error', (msg: any) => {
            console.error('System error:', msg);
            alert(`Error: ${msg.payload.message}`);
            setIsRollingBack(false);
        });

    }, [currentSessionId]);

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

        wsClient.emit('branch.create_requested', {
            checkpoint_node_id: selectedNode.id,
            name: newPrompt,
            fromCommitHash: selectedNode.data.commit_sha,
            parentSessionId: currentSessionId
        });
    };

    // Handle Rollback
    const handleRollback = () => {
        if (!selectedNode || !selectedNode.data.commit_sha) {
            alert('Cannot rollback: No commit hash available for this step.');
            return;
        }

        if (confirm(`Are you sure you want to rollback to Step ${selectedNode.data.step}? This will reset the agent's state.`)) {
            setIsRollingBack(true);
            wsClient.emit('state.rollback_requested', {
                commitHash: selectedNode.data.commit_sha
            });
        }
    };

    return (
        <div className="h-screen w-full bg-[#0a0a0f] relative">
            {isRollingBack && (
                <div className="absolute inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center">
                    <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 flex flex-col items-center shadow-2xl">
                        <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-3" />
                        <h3 className="text-white font-semibold">Rolling back state...</h3>
                        <p className="text-gray-400 text-sm mt-1">Please wait while the agent resets.</p>
                    </div>
                </div>
            )}

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

                        {selectedNode.data.commit_sha && (
                            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/30 flex items-center gap-2">
                                <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Commit:</span>
                                <code className="text-blue-400 text-xs font-mono bg-blue-900/30 px-1.5 py-0.5 rounded">
                                    {selectedNode.data.commit_sha.substring(0, 7)}
                                </code>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={handleBranch}
                            className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-2.5 px-4 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40 hover:-translate-y-0.5"
                        >
                            <GitBranch className="w-4 h-4" />
                            Branch
                        </button>
                        <button
                            onClick={handleRollback}
                            className="bg-red-600/80 hover:bg-red-500 text-white text-sm font-medium py-2.5 px-4 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-red-900/20 hover:shadow-red-900/40 hover:-translate-y-0.5"
                        >
                            <RotateCcw className="w-4 h-4" />
                            Rollback
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
