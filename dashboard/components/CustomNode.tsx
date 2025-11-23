import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Brain, Terminal, FileCode, CheckCircle, GitBranch } from 'lucide-react';

const CustomNode = ({ data, selected }: NodeProps) => {
    // Determine icon based on content
    const getIcon = () => {
        if (data.decision) return <CheckCircle className="w-4 h-4 text-green-400" />;
        if (data.file) return <FileCode className="w-4 h-4 text-blue-400" />;
        if (data.thought && data.thought.toLowerCase().includes('tool')) return <Terminal className="w-4 h-4 text-orange-400" />;
        return <Brain className="w-4 h-4 text-purple-400" />;
    };

    // Determine border color based on selection and type
    const getBorderClass = () => {
        if (selected) return 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]';
        return 'border-gray-700 hover:border-gray-500';
    };

    return (
        <div className={`
            px-4 py-3 rounded-xl bg-gray-900/80 backdrop-blur-md border 
            transition-all duration-300 min-w-[200px] max-w-[300px]
            ${getBorderClass()}
        `}>
            <Handle type="target" position={Position.Top} className="!bg-gray-500 !w-2 !h-2" />

            <div className="flex items-start gap-3">
                <div className="mt-1 p-1.5 rounded-lg bg-gray-800/50 border border-gray-700/50">
                    {getIcon()}
                </div>

                <div className="flex-1 overflow-hidden">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                            Step {data.step}
                        </span>
                        {data.isBranch && (
                            <GitBranch className="w-3 h-3 text-yellow-500" />
                        )}
                    </div>

                    <div className="text-sm font-medium text-gray-200 truncate">
                        {data.thought || data.decision || "Processing..."}
                    </div>

                    {data.file && (
                        <div className="mt-1.5 text-[10px] text-gray-400 flex items-center gap-1 bg-gray-800/50 px-1.5 py-0.5 rounded w-fit">
                            <FileCode className="w-3 h-3" />
                            <span className="truncate max-w-[150px]">{data.file}</span>
                        </div>
                    )}
                </div>
            </div>

            <Handle type="source" position={Position.Bottom} className="!bg-gray-500 !w-2 !h-2" />
        </div>
    );
};

export default memo(CustomNode);
