type EventHandler = (data: any) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<EventHandler>>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private url: string;

  constructor() {
    this.url = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000';
  }

  connect(token: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.ws = new WebSocket(`${this.url}/ws?token=${token}`);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.emit('connected', {});
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.emit(message.event, message.payload);
      } catch {
        console.error('Failed to parse WebSocket message');
      }
    };

    this.ws.onclose = () => {
      this.emit('disconnected', {});
      this.attemptReconnect(token);
    };

    this.ws.onerror = () => {
      console.error('WebSocket error');
    };
  }

  private attemptReconnect(token: string): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    setTimeout(() => this.connect(token), delay);
  }

  send(event: string, payload: any): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ event, payload, timestamp: Date.now() }));
  }

  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }

  private emit(event: string, data: any): void {
    this.handlers.get(event)?.forEach((handler) => handler(data));
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }
}

export const wsClient = new WebSocketClient();
