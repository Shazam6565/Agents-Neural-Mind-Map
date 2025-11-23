import { useEffect, useState, useCallback } from 'react';
import io, { Socket } from 'socket.io-client';

interface AgentStatusData {
    status: 'RUNNING' | 'IDLE' | 'PAUSED' | 'ROLLING_BACK';
}

interface StateUpdateData {
    sessionId: string;
    step: number;
    filesModified: string[];
}

export function useAgentSocket(sessionId: string) {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [agentStatus, setAgentStatus] = useState<'RUNNING' | 'IDLE' | 'PAUSED' | 'ROLLING_BACK'>('IDLE');
    const [lastUpdate, setLastUpdate] = useState<StateUpdateData | null>(null);

    useEffect(() => {
        const newSocket = io('http://localhost:3001');

        newSocket.on('connect', () => {
            console.log('WebSocket connected');
            newSocket.emit('subscribe-session', sessionId);
        });

        newSocket.on('state-update', (data: StateUpdateData) => {
            console.log('Agent state updated:', data);
            setLastUpdate(data);
        });

        newSocket.on('state-restored', (data: StateUpdateData) => {
            console.log('State restored:', data);
            setLastUpdate(data);
        });

        newSocket.on('agent-status', (data: AgentStatusData) => {
            setAgentStatus(data.status);
        });

        newSocket.on('disconnect', () => {
            console.log('WebSocket disconnected');
        });

        setSocket(newSocket);

        return () => {
            newSocket.close();
        };
    }, [sessionId]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const emitEvent = useCallback((eventName: string, data: unknown) => {
        if (socket) {
            socket.emit(eventName, data);
        }
    }, [socket]);

    return {
        socket,
        agentStatus,
        lastUpdate,
        emitEvent,
        isConnected: socket?.connected || false
    };
}
