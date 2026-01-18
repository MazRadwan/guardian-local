import { renderHook, act } from '@testing-library/react';
import { useStreamingText, useStreamingTextWithSkip } from '../useStreamingText';

describe('useStreamingText', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should stream text progressively', () => {
    const { result } = renderHook(() =>
      useStreamingText({ text: 'Hello', speed: 10 })
    );

    // Initially empty and streaming
    expect(result.current.displayedText).toBe('');
    expect(result.current.isStreaming).toBe(true);
    expect(result.current.isComplete).toBe(false);

    // After 100ms (1 char at 10 chars/sec)
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(result.current.displayedText).toBe('H');
    expect(result.current.isStreaming).toBe(true);

    // After 400ms more (4 more chars)
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(result.current.displayedText).toBe('Hello');
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.isComplete).toBe(true);
  });

  it('should call onComplete when finished', () => {
    const onComplete = jest.fn();
    renderHook(() =>
      useStreamingText({ text: 'Hi', speed: 100, onComplete })
    );

    expect(onComplete).not.toHaveBeenCalled();

    // At 100 chars/sec, 2 chars takes 20ms
    act(() => {
      jest.advanceTimersByTime(20);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('should handle empty text', () => {
    const { result } = renderHook(() =>
      useStreamingText({ text: '', speed: 10 })
    );

    expect(result.current.displayedText).toBe('');
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.isComplete).toBe(false);
  });

  it('should show full text immediately when disabled', () => {
    const { result } = renderHook(() =>
      useStreamingText({ text: 'Hello World', speed: 10, enabled: false })
    );

    expect(result.current.displayedText).toBe('Hello World');
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.isComplete).toBe(true);
  });

  it('should restart streaming when text changes', () => {
    const { result, rerender } = renderHook(
      ({ text }) => useStreamingText({ text, speed: 10 }),
      { initialProps: { text: 'Hi' } }
    );

    // Stream first text partially
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(result.current.displayedText).toBe('H');

    // Change text
    rerender({ text: 'Bye' });

    // Should reset and start streaming new text
    expect(result.current.displayedText).toBe('');
    expect(result.current.isStreaming).toBe(true);

    // Continue streaming new text
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(result.current.displayedText).toBe('Bye');
    expect(result.current.isStreaming).toBe(false);
  });

  it('should use default speed of 40 chars/sec', () => {
    const { result } = renderHook(() =>
      useStreamingText({ text: 'Test' })
    );

    // 40 chars/sec = 25ms per char
    // After 25ms, should have 1 char
    act(() => {
      jest.advanceTimersByTime(25);
    });
    expect(result.current.displayedText).toBe('T');

    // After 75ms more (100ms total = 4 chars)
    act(() => {
      jest.advanceTimersByTime(75);
    });
    expect(result.current.displayedText).toBe('Test');
  });

  it('should clean up timer on unmount', () => {
    const { unmount } = renderHook(() =>
      useStreamingText({ text: 'Hello World', speed: 10 })
    );

    // Unmount before completion
    unmount();

    // Should not throw when timers fire
    expect(() => {
      jest.advanceTimersByTime(1000);
    }).not.toThrow();
  });

  it('should handle very fast speed', () => {
    const { result } = renderHook(() =>
      useStreamingText({ text: 'Hi', speed: 1000 })
    );

    // 1000 chars/sec = 1ms per char
    act(() => {
      jest.advanceTimersByTime(2);
    });
    expect(result.current.displayedText).toBe('Hi');
    expect(result.current.isComplete).toBe(true);
  });
});

describe('useStreamingTextWithSkip', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should provide skip functionality', () => {
    const { result } = renderHook(() =>
      useStreamingTextWithSkip({ text: 'Hello World', speed: 10 })
    );

    // Initially streaming
    expect(result.current.isStreaming).toBe(true);
    expect(result.current.skipped).toBe(false);

    // Skip to end
    act(() => {
      result.current.skip();
    });

    // Should show full text
    expect(result.current.displayedText).toBe('Hello World');
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.skipped).toBe(true);
  });

  it('should reset skip state when text changes', () => {
    const { result, rerender } = renderHook(
      ({ text }) => useStreamingTextWithSkip({ text, speed: 10 }),
      { initialProps: { text: 'Hello' } }
    );

    // Skip first text
    act(() => {
      result.current.skip();
    });
    expect(result.current.skipped).toBe(true);

    // Change text
    rerender({ text: 'World' });

    // Skip should be reset
    expect(result.current.skipped).toBe(false);
    expect(result.current.isStreaming).toBe(true);
  });
});
