import { io, Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';

type EventHandler = (payload: unknown) => void;

export class WebSocketClient {
    private static instance: WebSocketClient;
    private socket: Socket | null = null;
    private eventHandlers: Map<string, EventHandler[]> = new Map();
    private processedEventIds: Set<string> = new Set();
    private isConnected: boolean = false;

    private constructor() { }

    public static getInstance(): WebSocketClient {
        if (!WebSocketClient.instance) {
            WebSocketClient.instance = new WebSocketClient();
        }
        return WebSocketClient.instance;
    }

    public connect(url: string = 'http://localhost:3001'): void {
        if (this.socket && this.socket.connected) return;

        this.socket = io(url, {
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000,
        });

        this.socket.on('connect', () => {
            console.log('WebSocket connected');
            this.isConnected = true;
        });

        this.socket.on('disconnect', () => {
            console.log('WebSocket disconnected');
            this.isConnected = false;
        });

        this.socket.on('agent-event', (message: any) => {
            this.handleIncomingMessage(message);
        });
    }

    public on(eventType: string, handler: EventHandler): void {
        if (!this.eventHandlers.has(eventType)) {
            this.eventHandlers.set(eventType, []);
        }
        this.eventHandlers.get(eventType)?.push(handler);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public emit(eventType: string, payload: unknown): void {
        if (!this.socket) {
            console.error('WebSocket not connected');
            return;
        }

        const message = {
            event_id: uuidv4(),
            event_type: eventType,
            timestamp: new Date().toISOString(),
            payload: payload
        };

        this.socket.emit(eventType, message);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private handleIncomingMessage(message: unknown): void {
        // Basic validation
        if (!message || typeof message !== 'object' || !(message as any).event_id || !(message as any).event_type) {
            console.warn('Received invalid message format:', message);
            return;
        }
        const msg = message as any;
        // Deduplication
        if (this.processedEventIds.has(msg.event_id)) {
            console.debug(`Duplicate event ignored: ${msg.event_id}`);
            return;
        }
        this.processedEventIds.add(msg.event_id);

        // Limit set size to prevent memory leaks
        if (this.processedEventIds.size > 1000) {
            const it = this.processedEventIds.values();
            const nextVal = it.next().value;
            if (nextVal) {
                this.processedEventIds.delete(nextVal);
            }
        }

        // Dispatch to handlers
        const handlers = this.eventHandlers.get(msg.event_type);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(msg.payload);
                } catch (e) {
                    console.error(`Error in handler for ${msg.event_type}:`, e);
                }
            });
        }
    }
}

export const wsClient = WebSocketClient.getInstance();
