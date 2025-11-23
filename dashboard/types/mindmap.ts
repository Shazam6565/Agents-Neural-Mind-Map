export type NodeType = 'reasoning' | 'decision' | 'tool_call' | 'code_edit' | 'error';

export interface AgentEvent {
    id?: string;
    step?: number;
    timestamp?: string;
    type: NodeType;
    content?: string;
    thought?: string;
    decision?: string;
    alternatives?: string[];
    file?: string;
    metadata?: {
        confidence?: number;
        file?: string;
        [key: string]: any;
    };
    parentId?: string; // To build the tree
}

export interface MindMapNode {
    id: string;
    type: string; // React Flow node type
    position: { x: number; y: number };
    data: {
        label: string;
        timestamp: string;
        type: NodeType;
        details: string;
        metadata?: any;
    };
}

export interface MindMapEdge {
    id: string;
    source: string;
    target: string;
    animated?: boolean;
    label?: string;
}
