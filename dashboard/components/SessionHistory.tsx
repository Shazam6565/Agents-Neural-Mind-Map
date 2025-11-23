'use client';

import { useEffect, useState } from 'react';

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
            <div className="w-64 bg-gray-900 border-r border-gray-700 p-4">
                <h2 className="text-xl font-bold mb-4 text-white">Session History</h2>
                <div className="text-gray-400 text-sm">Loading sessions...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="w-64 bg-gray-900 border-r border-gray-700 p-4">
                <h2 className="text-xl font-bold mb-4 text-white">Session History</h2>
                <div className="text-red-400 text-sm">{error}</div>
                <button
                    onClick={fetchSessions}
                    className="mt-2 px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white text-sm"
                >
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="w-64 bg-gray-900 border-r border-gray-700 p-4 overflow-y-auto h-screen">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-white">Sessions</h2>
                <button
                    onClick={fetchSessions}
                    className="text-gray-400 hover:text-white text-sm"
                    title="Refresh"
                >
                    ↻
                </button>
            </div>

            {sessions.length === 0 ? (
                <div className="text-gray-400 text-sm">
                    No sessions yet. Run a task to create your first session.
                </div>
            ) : (
                <div className="space-y-2">
                    {sessions.map((session) => (
                        <button
                            key={session.session_id}
                            onClick={() => onSelectSession(session.session_id)}
                            className={`w-full text-left p-3 rounded-lg transition-colors ${currentSessionId === session.session_id
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                                }`}
                        >
                            <div className="font-medium truncate text-sm">
                                {session.prompt}
                            </div>
                            <div className="text-xs text-gray-400 mt-1 flex items-center gap-2">
                                <span>{session.step_count} steps</span>
                                <span>•</span>
                                <span>{formatDate(session.created_at)}</span>
                            </div>
                            {session.parent_session_id && (
                                <div className="text-xs text-yellow-400 mt-1 flex items-center gap-1">
                                    <span>↳</span>
                                    <span>Branched</span>
                                </div>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
