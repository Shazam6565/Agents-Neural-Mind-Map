'use client';

import { useState } from 'react';
import { Undo2, Play, Pause, AlertTriangle, FileCode, Check } from 'lucide-react';

interface RestorationPreview {
    filesAffected: string[];
    conflicts: Array<{
        file: string;
        diff: string;
        snapshot_lines: number;
        current_lines: number;
    }>;
    restoredStep: number;
    warnings?: string[];
}

interface MindMapControlsProps {
    sessionId: string;
    selectedNode: number | null;
    onRestoreComplete?: () => void;
}

export default function MindMapControls({
    sessionId,
    selectedNode,
    onRestoreComplete
}: MindMapControlsProps) {
    const [showPreview, setShowPreview] = useState(false);
    const [preview, setPreview] = useState<RestorationPreview | null>(null);
    const [isRestoring, setIsRestoring] = useState(false);
    const [isLoadingPreview, setIsLoadingPreview] = useState(false);

    const handleRestoreClick = async () => {
        if (!selectedNode) return;

        setIsLoadingPreview(true);

        try {
            // Get preview first
            const response = await fetch(
                `http://localhost:3001/api/sessions/${sessionId}/rollback`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        targetStep: selectedNode,
                        applyToFilesystem: false  // Preview only
                    })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                alert(`Error: ${data.error || 'Failed to load preview'}`);
                return;
            }

            setPreview({
                filesAffected: data.files_affected || [],
                conflicts: data.conflicts || [],
                restoredStep: selectedNode,
                warnings: data.warnings || []
            });
            setShowPreview(true);

        } catch (error) {
            console.error('Failed to load preview:', error);
            alert('Failed to load restoration preview');
        } finally {
            setIsLoadingPreview(false);
        }
    };

    const confirmRestore = async () => {
        if (!selectedNode) return;

        setIsRestoring(true);

        try {
            const response = await fetch(
                `http://localhost:3001/api/sessions/${sessionId}/rollback`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        targetStep: selectedNode,
                        applyToFilesystem: true  // Actually restore
                    })
                }
            );

            const result = await response.json();

            if (!response.ok) {
                alert(`Restoration failed: ${result.error || 'Unknown error'}`);
                return;
            }

            // Success!
            alert(`✅ Restored to step ${result.restored_step}\n\nBackup ID: ${result.backup_id}\n\nFiles modified: ${result.files_modified.length}`);
            setShowPreview(false);

            // Notify parent to refresh
            if (onRestoreComplete) {
                onRestoreComplete();
            }

        } catch (error) {
            console.error('Failed to restore:', error);
            alert('Restoration failed. Check console for details.');
        } finally {
            setIsRestoring(false);
        }
    };

    return (
        <>
            {/* Fixed Control Bar */}
            <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3">
                <button
                    onClick={handleRestoreClick}
                    disabled={!selectedNode || isLoadingPreview}
                    className={`
            group px-5 py-3 rounded-xl font-bold text-sm
            backdrop-blur-xl border-2 shadow-2xl
            transition-all duration-300 transform
            ${selectedNode
                            ? 'bg-blue-500/20 border-blue-400/50 text-blue-200 hover:bg-blue-500/30 hover:scale-105 hover:shadow-blue-500/50'
                            : 'bg-gray-500/10 border-gray-500/30 text-gray-500 cursor-not-allowed'
                        }
          `}
                >
                    <div className="flex items-center gap-2">
                        <Undo2 className={`w-4 h-4 ${isLoadingPreview ? 'animate-spin' : 'group-hover:animate-pulse'}`} />
                        {isLoadingPreview ? 'Loading...' : 'Restore to Node'}
                    </div>
                </button>
            </div>

            {/* Restoration Preview Dialog */}
            {showPreview && preview && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={() => setShowPreview(false)}
                    />

                    {/* Dialog */}
                    <div className="relative w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-2xl bg-gray-900 border-2 border-blue-500/50 shadow-2xl">
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-white/10 bg-gradient-to-r from-blue-500/20 to-purple-500/20">
                            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                                <Undo2 className="w-6 h-6" />
                                Restore to Step {preview.restoredStep}?
                            </h2>
                        </div>

                        {/* Content */}
                        <div className="p-6 overflow-y-auto max-h-[60vh] space-y-6">
                            {/* Warnings */}
                            {preview.warnings && preview.warnings.length > 0 && (
                                <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
                                    <div className="flex items-start gap-3">
                                        <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                                        <div>
                                            <div className="font-semibold text-yellow-200 mb-2">Warnings:</div>
                                            <ul className="space-y-1 text-sm text-yellow-100">
                                                {preview.warnings.map((warn, idx) => (
                                                    <li key={idx}>• {warn}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Files Affected */}
                            <div>
                                <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
                                    <FileCode className="w-4 h-4" />
                                    Files Affected ({preview.filesAffected.length})
                                </h3>
                                <div className="grid gap-2">
                                    {preview.filesAffected.slice(0, 10).map((file, idx) => (
                                        <div
                                            key={idx}
                                            className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 font-mono text-sm text-gray-300"
                                        >
                                            {file}
                                        </div>
                                    ))}
                                    {preview.filesAffected.length > 10 && (
                                        <div className="text-sm text-gray-400 italic">
                                            ... and {preview.filesAffected.length - 10} more files
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Conflicts */}
                            {preview.conflicts.length > 0 && (
                                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30">
                                    <div className="flex items-start gap-3">
                                        <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                                        <div className="flex-1">
                                            <div className="font-semibold text-red-200 mb-3">
                                                ⚠️ Conflicts Detected ({preview.conflicts.length})
                                            </div>
                                            <div className="space-y-3">
                                                {preview.conflicts.map((conflict, idx) => (
                                                    <details key={idx} className="group">
                                                        <summary className="cursor-pointer font-mono text-sm text-red-300 hover:text-red-200 transition-colors">
                                                            <span className="inline-block w-64 truncate align-middle">{conflict.file}</span>
                                                            <span className="text-xs ml-2 text-red-400">
                                                                ({conflict.current_lines} → {conflict.snapshot_lines} lines)
                                                            </span>
                                                        </summary>
                                                        <pre className="mt-2 p-3 bg-black/40 rounded-lg text-xs overflow-x-auto text-gray-300 border border-white/5">
                                                            {conflict.diff}
                                                        </pre>
                                                    </details>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-white/10 bg-gray-900/50 flex justify-end gap-3">
                            <button
                                onClick={() => setShowPreview(false)}
                                className="px-5 py-2.5 rounded-lg font-semibold text-sm
                         bg-gray-500/20 hover:bg-gray-500/30 border border-gray-500/50
                         text-gray-300 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmRestore}
                                disabled={isRestoring}
                                className={`
                  px-5 py-2.5 rounded-lg font-semibold text-sm
                  transition-all flex items-center gap-2
                  ${isRestoring
                                        ? 'bg-blue-500/30 border-blue-500/50 text-blue-300 cursor-wait'
                                        : 'bg-blue-500/40 hover:bg-blue-500/60 border-2 border-blue-400/60 text-white hover:shadow-lg hover:shadow-blue-500/50'
                                    }
                `}
                            >
                                {isRestoring ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Restoring...
                                    </>
                                ) : (
                                    <>
                                        <Check className="w-4 h-4" />
                                        Confirm Restore
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
