import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { EventBus } from '../src/operations/event-bus';
import type { DispatchEvent } from '../src/types/schemas';

describe('EventBus', () => {
  beforeEach(() => {
    EventBus.clear();
  });

  afterAll(() => {
    EventBus.clear();
  });
  const mockEvent: DispatchEvent = {
    id: 'e1',
    type: 'task.created',
    teamName: 'team1',
    timestamp: new Date().toISOString(),
    payload: { taskId: 't1' }
  };

  it('should subscribe and receive events', async () => {
    let received: DispatchEvent | undefined;
    EventBus.subscribe('task.created', (event) => {
      received = event;
    });

    await EventBus.emit(mockEvent);
    expect(received).toEqual(mockEvent);
  });

  it('should handle multiple subscribers', async () => {
    let count = 0;
    EventBus.subscribe('task.created', () => { count++; });
    EventBus.subscribe('task.created', () => { count++; });

    await EventBus.emit(mockEvent);
    expect(count).toBe(2);
  });

  it('should unsubscribe correctly', async () => {
    let count = 0;
    const unsubscribe = EventBus.subscribe('task.created', () => { count++; });
    
    unsubscribe();
    await EventBus.emit(mockEvent);
    expect(count).toBe(0);
  });

  it('should not crash when handler throws error', async () => {
    EventBus.subscribe('task.created', () => {
      throw new Error('Test error');
    });

    // Should not throw
    await EventBus.emit(mockEvent);
  });

  it('should clear all handlers', async () => {
    let count = 0;
    EventBus.subscribe('task.created', () => { count++; });
    
    EventBus.clear();
    await EventBus.emit(mockEvent);
    expect(count).toBe(0);
  });

  it('should ignore events with no subscribers', async () => {
    // Should not throw or error
    await EventBus.emit(mockEvent);
  });

  it('should support async handlers', async () => {
    let processed = false;
    EventBus.subscribe('task.created', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      processed = true;
    });

    await EventBus.emit(mockEvent);
    expect(processed).toBe(true);
  });
});
