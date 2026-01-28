/**
 * Unit tests for SocketProgressEmitter
 *
 * Story 32.1.3: WebSocket Progress Event Type
 *
 * Tests:
 * - Verify emit calls socket.emit() with correct event name
 * - Verify correct event structure including all fields
 * - Verify conversationId in payload matches constructor
 * - Verify factory function creates valid emitter
 * - Verify timestamp is included
 * - Verify seq number is passed through
 */

import { Socket } from 'socket.io';
import {
  SocketProgressEmitter,
  createSocketProgressEmitter,
  WebSocketProgressEvent,
} from '../../../../../src/infrastructure/websocket/emitters/SocketProgressEmitter.js';
import type { IProgressEmitter } from '../../../../../src/application/interfaces/IProgressEmitter.js';

describe('SocketProgressEmitter', () => {
  let mockSocket: jest.Mocked<Socket>;
  const testConversationId = 'conv-123-456';

  beforeEach(() => {
    mockSocket = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<Socket>;
  });

  describe('constructor', () => {
    it('should create an instance with socket and conversationId', () => {
      const emitter = new SocketProgressEmitter(mockSocket, testConversationId);
      expect(emitter).toBeInstanceOf(SocketProgressEmitter);
    });

    it('should implement IProgressEmitter interface', () => {
      const emitter: IProgressEmitter = new SocketProgressEmitter(mockSocket, testConversationId);
      expect(typeof emitter.emit).toBe('function');
    });
  });

  describe('emit()', () => {
    it('should call socket.emit with questionnaire_progress event name', () => {
      const emitter = new SocketProgressEmitter(mockSocket, testConversationId);

      emitter.emit('Analyzing...', 1, 10, 1);

      expect(mockSocket.emit).toHaveBeenCalledTimes(1);
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'questionnaire_progress',
        expect.any(Object)
      );
    });

    it('should include conversationId in payload', () => {
      const emitter = new SocketProgressEmitter(mockSocket, testConversationId);

      emitter.emit('Processing...', 2, 10, 2);

      const emittedPayload = mockSocket.emit.mock.calls[0][1] as WebSocketProgressEvent;
      expect(emittedPayload.conversationId).toBe(testConversationId);
    });

    it('should include message in payload', () => {
      const emitter = new SocketProgressEmitter(mockSocket, testConversationId);
      const testMessage = 'Generating questions for Data Security...';

      emitter.emit(testMessage, 3, 11, 3);

      const emittedPayload = mockSocket.emit.mock.calls[0][1] as WebSocketProgressEvent;
      expect(emittedPayload.message).toBe(testMessage);
    });

    it('should include step and totalSteps in payload', () => {
      const emitter = new SocketProgressEmitter(mockSocket, testConversationId);

      emitter.emit('Validating...', 5, 12, 5);

      const emittedPayload = mockSocket.emit.mock.calls[0][1] as WebSocketProgressEvent;
      expect(emittedPayload.step).toBe(5);
      expect(emittedPayload.totalSteps).toBe(12);
    });

    it('should include timestamp in payload', () => {
      const emitter = new SocketProgressEmitter(mockSocket, testConversationId);
      const beforeEmit = Date.now();

      emitter.emit('Finalizing...', 10, 10, 10);

      const afterEmit = Date.now();
      const emittedPayload = mockSocket.emit.mock.calls[0][1] as WebSocketProgressEvent;
      expect(emittedPayload.timestamp).toBeGreaterThanOrEqual(beforeEmit);
      expect(emittedPayload.timestamp).toBeLessThanOrEqual(afterEmit);
    });

    it('should include seq number in payload', () => {
      const emitter = new SocketProgressEmitter(mockSocket, testConversationId);

      emitter.emit('Processing...', 1, 10, 42);

      const emittedPayload = mockSocket.emit.mock.calls[0][1] as WebSocketProgressEvent;
      expect(emittedPayload.seq).toBe(42);
    });

    it('should emit multiple progress events with different data', () => {
      const emitter = new SocketProgressEmitter(mockSocket, testConversationId);

      emitter.emit('Step 1', 1, 5, 1);
      emitter.emit('Step 2', 2, 5, 2);
      emitter.emit('Step 3', 3, 5, 3);

      expect(mockSocket.emit).toHaveBeenCalledTimes(3);

      const firstPayload = mockSocket.emit.mock.calls[0][1] as WebSocketProgressEvent;
      const secondPayload = mockSocket.emit.mock.calls[1][1] as WebSocketProgressEvent;
      const thirdPayload = mockSocket.emit.mock.calls[2][1] as WebSocketProgressEvent;

      expect(firstPayload.message).toBe('Step 1');
      expect(firstPayload.step).toBe(1);
      expect(firstPayload.seq).toBe(1);

      expect(secondPayload.message).toBe('Step 2');
      expect(secondPayload.step).toBe(2);
      expect(secondPayload.seq).toBe(2);

      expect(thirdPayload.message).toBe('Step 3');
      expect(thirdPayload.step).toBe(3);
      expect(thirdPayload.seq).toBe(3);
    });

    it('should include all required fields in event structure', () => {
      const emitter = new SocketProgressEmitter(mockSocket, testConversationId);

      emitter.emit('Test message', 7, 15, 99);

      const emittedPayload = mockSocket.emit.mock.calls[0][1] as WebSocketProgressEvent;

      // Verify all required fields are present
      expect(emittedPayload).toHaveProperty('conversationId');
      expect(emittedPayload).toHaveProperty('message');
      expect(emittedPayload).toHaveProperty('step');
      expect(emittedPayload).toHaveProperty('totalSteps');
      expect(emittedPayload).toHaveProperty('timestamp');
      expect(emittedPayload).toHaveProperty('seq');

      // Verify field types
      expect(typeof emittedPayload.conversationId).toBe('string');
      expect(typeof emittedPayload.message).toBe('string');
      expect(typeof emittedPayload.step).toBe('number');
      expect(typeof emittedPayload.totalSteps).toBe('number');
      expect(typeof emittedPayload.timestamp).toBe('number');
      expect(typeof emittedPayload.seq).toBe('number');
    });
  });

  describe('createSocketProgressEmitter()', () => {
    it('should return IProgressEmitter implementation', () => {
      const emitter = createSocketProgressEmitter(mockSocket, testConversationId);

      expect(typeof emitter.emit).toBe('function');
    });

    it('should create emitter that emits to provided socket', () => {
      const emitter = createSocketProgressEmitter(mockSocket, testConversationId);

      emitter.emit('Factory test', 1, 5, 1);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'questionnaire_progress',
        expect.objectContaining({
          conversationId: testConversationId,
          message: 'Factory test',
        })
      );
    });

    it('should create independent emitters for different conversations', () => {
      const mockSocket1 = { emit: jest.fn() } as unknown as jest.Mocked<Socket>;
      const mockSocket2 = { emit: jest.fn() } as unknown as jest.Mocked<Socket>;

      const emitter1 = createSocketProgressEmitter(mockSocket1, 'conv-1');
      const emitter2 = createSocketProgressEmitter(mockSocket2, 'conv-2');

      emitter1.emit('Message 1', 1, 10, 1);
      emitter2.emit('Message 2', 2, 10, 2);

      // Each socket should only receive its own events
      expect(mockSocket1.emit).toHaveBeenCalledTimes(1);
      expect(mockSocket2.emit).toHaveBeenCalledTimes(1);

      const payload1 = mockSocket1.emit.mock.calls[0][1] as WebSocketProgressEvent;
      const payload2 = mockSocket2.emit.mock.calls[0][1] as WebSocketProgressEvent;

      expect(payload1.conversationId).toBe('conv-1');
      expect(payload2.conversationId).toBe('conv-2');
    });
  });

  describe('event payload structure compliance', () => {
    it('should emit payload matching WebSocketProgressEvent interface', () => {
      const emitter = new SocketProgressEmitter(mockSocket, testConversationId);

      emitter.emit('Analyzing vendor context...', 1, 11, 1);

      const payload = mockSocket.emit.mock.calls[0][1] as WebSocketProgressEvent;

      // This should compile if WebSocketProgressEvent is correctly defined
      const validated: WebSocketProgressEvent = {
        conversationId: payload.conversationId,
        message: payload.message,
        step: payload.step,
        totalSteps: payload.totalSteps,
        timestamp: payload.timestamp,
        seq: payload.seq,
      };

      expect(validated).toEqual(payload);
    });

    it('should use direct socket.emit (not io.to().emit pattern)', () => {
      // This test verifies the architectural decision to use direct emission
      // The mock confirms socket.emit is called directly
      const emitter = new SocketProgressEmitter(mockSocket, testConversationId);

      emitter.emit('Direct emission test', 1, 1, 1);

      // Verify socket.emit was called directly (the only method on our mock)
      expect(mockSocket.emit).toHaveBeenCalled();
    });
  });
});
