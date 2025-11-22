import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { AgentEvent } from '@/types/mindmap';

export function useAgentStream() {
    const [events, setEvents] = useState<AgentEvent[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [socket, setSocket] = useState<Socket | null>(null);

    useEffect(() => {
        const socketInstance = io('http://localhost:3001');

        socketInstance.on('connect', () => {
            setIsConnected(true);
            console.log('Connected to Agent Stream');
        });

        socketInstance.on('disconnect', () => {
            setIsConnected(false);
            console.log('Disconnected from Agent Stream');
        });

        socketInstance.on('agent-event', (event: AgentEvent) => {
            console.log('New Event:', event);
            setEvents((prev) => [...prev, event]);
        });

        setSocket(socketInstance);

        return () => {
            socketInstance.disconnect();
        };
    }, []);

    return { events, isConnected };
}
