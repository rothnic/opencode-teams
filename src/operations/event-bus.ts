import type { DispatchEvent, DispatchEventType } from '../types/schemas';

type EventHandler = (event: DispatchEvent) => void | Promise<void>;

export const EventBus = {
  _handlers: new Map<DispatchEventType, Set<EventHandler>>(),

  subscribe(eventType: DispatchEventType, handler: EventHandler): () => void {
    if (!EventBus._handlers.has(eventType)) {
      EventBus._handlers.set(eventType, new Set());
    }
    EventBus._handlers.get(eventType)!.add(handler);
    // Return unsubscribe function
    return () => {
      EventBus._handlers.get(eventType)?.delete(handler);
    };
  },

  async emit(event: DispatchEvent): Promise<void> {
    const handlers = EventBus._handlers.get(event.type);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`[EventBus] Handler error for ${event.type}: ${msg}`);
      }
    }
  },

  clear(): void {
    EventBus._handlers.clear();
  },
};
