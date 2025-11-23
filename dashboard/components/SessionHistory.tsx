'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, Clock, GitBranch, Terminal, AlertCircle } from 'lucide-react';

interface Session {
    session_id: string;
    parent_session_id: string | null;
    prompt: string;
    created_at: string;
    step_count: number;
}

interface SessionHistoryProps {
    onSelectSession: (sessionId: string) => void;
    currentSessionId: string | null;
}

export default function SessionHistory({ onSelectSession, currentSessionId }: SessionHistoryProps) {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchSessions();

        // Listen for refresh events from MindMap
        const handleRefresh = () => fetchSessions();
        window.addEventListener('refresh-sessions', handleRefresh);

        return () => {
            window.removeEventListener('refresh-sessions', handleRefresh);
        };
    }, []);

    const fetchSessions = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await fetch('http://localhost:3001/api/sessions');

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            setSessions(data);
        } catch (error) {
            console.error('Error fetching sessions:', error);
            setError('Failed to load sessions');
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (loading) {
        return (
            <div className="w-80 bg-gray-900/50 backdrop-blur-xl border-r border-gray-800 p-6 h-screen flex flex-col items-center justify-center">
                <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mb-4" />
                <div className="text-gray-400 text-sm font-medium">Loading sessions...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="w-80 bg-gray-900/50 backdrop-blur-xl border-r border-gray-800 p-6 h-screen flex flex-col items-center justify-center text-center">
                <AlertCircle className="w-10 h-10 text-red-500 mb-4" />
                <h2 className="text-lg font-bold mb-2 text-white">Connection Error</h2>
                <div className="text-red-400 text-sm mb-6">{error}</div>
                <button
                    onClick={fetchSessions}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white text-sm font-medium transition-colors shadow-lg shadow-blue-900/20"
                >
                    Retry Connection
                </button>
            </div>
        );
    }

    return (
        <div className="w-80 bg-gray-900/80 backdrop-blur-xl border-r border-gray-800 p-4 overflow-y-auto h-screen flex flex-col">
            <div className="flex justify-between items-center mb-6 px-2 pt-2">
                <div className="flex items-center gap-2">
                    <Terminal className="w-5 h-5 text-blue-500" />
                    <h2 className="text-lg font-bold text-white tracking-tight">Agent Sessions</h2>
                </div>
                <button
                    onClick={fetchSessions}
                    className="text-gray-500 hover:text-white transition-colors p-2 hover:bg-gray-800 rounded-full"
                    title="Refresh"
                >
                    <RefreshCw className="w-4 h-4" />
                </button>
            </div>

            {sessions.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                    <div className="w-16 h-16 bg-gray-800/50 rounded-full flex items-center justify-center mb-4">
                        <Terminal className="w-8 h-8 text-gray-600" />
                    </div>
                    <h3 className="text-gray-300 font-medium mb-2">No Sessions Yet</h3>
                    <p className="text-gray-500 text-sm">Run a task to create your first session.</p>
                </div>
            ) : (
                <div className="space-y-3 pb-4">
                    {sessions.map((session) => (
                        <button
                            key={session.session_id}
                            onClick={() => onSelectSession(session.session_id)}
                            className={`w-full text-left p-4 rounded-xl transition-all duration-200 group relative overflow-hidden border ${currentSessionId === session.session_id
                                ? 'bg-blue-600/10 border-blue-500/50 shadow-[0_0_20px_rgba(37,99,235,0.1)]'
                                : 'bg-gray-800/40 border-gray-700/50 hover:bg-gray-800 hover:border-gray-600'
                                }`}
                        >
                            {currentSessionId === session.session_id && (
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-l-xl" />
                            )}

                            <div className="flex justify-between items-start mb-2">
                                <div className={`font-medium truncate text-sm pr-2 ${currentSessionId === session.session_id ? 'text-blue-400' : 'text-gray-200 group-hover:text-white'
                                    }`}>
                                    {session.prompt}
                                </div>
                                {session.parent_session_id && (
                                    <GitBranch className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />
                                )}
                            </div>

                            <div className="flex items-center justify-between text-xs text-gray-500 group-hover:text-gray-400">
                                <div className="flex items-center gap-1.5">
                                    <Clock className="w-3 h-3" />
                                    <span>{formatDate(session.created_at)}</span>
                                </div>
                                <div className="bg-gray-900/50 px-2 py-0.5 rounded text-gray-400 font-medium">
                                    {session.step_count} steps
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
