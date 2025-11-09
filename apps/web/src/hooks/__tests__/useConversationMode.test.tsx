import { renderHook, act, waitFor } from '@testing-library/react';
import { useConversationMode } from '../useConversationMode';

describe('useConversationMode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initializes with default mode', () => {
    const { result } = renderHook(() => useConversationMode());

    expect(result.current.mode).toBe('consult');
    expect(result.current.isChanging).toBe(false);
  });

  it('initializes with provided mode', () => {
    const { result } = renderHook(() => useConversationMode('assessment'));

    expect(result.current.mode).toBe('assessment');
  });

  it('changes mode successfully', async () => {
    const { result } = renderHook(() => useConversationMode('consult'));

    await act(async () => {
      await result.current.changeMode('assessment');
    });

    expect(result.current.mode).toBe('assessment');
  });

  it('sets isChanging state during mode change', async () => {
    const { result } = renderHook(() => useConversationMode('consult'));

    // Start the mode change
    const changePromise = act(async () => {
      await result.current.changeMode('assessment');
    });

    // Wait for the change to complete
    await changePromise;

    // After change completes, isChanging should be false
    expect(result.current.isChanging).toBe(false);
  });

  it('resets isChanging state after mode change', async () => {
    const { result } = renderHook(() => useConversationMode('consult'));

    await act(async () => {
      await result.current.changeMode('assessment');
    });

    expect(result.current.isChanging).toBe(false);
  });

  it('does not change mode if already in that mode', async () => {
    const { result } = renderHook(() => useConversationMode('consult'));

    const initialMode = result.current.mode;

    await act(async () => {
      await result.current.changeMode('consult');
    });

    expect(result.current.mode).toBe(initialMode);
  });

  it('dispatches custom event on mode change', async () => {
    const eventListener = jest.fn();
    window.addEventListener('conversation:mode-changed', eventListener);

    const { result } = renderHook(() => useConversationMode('consult'));

    await act(async () => {
      await result.current.changeMode('assessment');
    });

    await waitFor(() => {
      expect(eventListener).toHaveBeenCalledTimes(1);
      expect(eventListener).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: { mode: 'assessment' },
        })
      );
    });

    window.removeEventListener('conversation:mode-changed', eventListener);
  });

  it('does not dispatch event if mode is same', async () => {
    const eventListener = jest.fn();
    window.addEventListener('conversation:mode-changed', eventListener);

    const { result } = renderHook(() => useConversationMode('consult'));

    await act(async () => {
      await result.current.changeMode('consult');
    });

    expect(eventListener).not.toHaveBeenCalled();

    window.removeEventListener('conversation:mode-changed', eventListener);
  });

  it('can change mode back and forth', async () => {
    const { result } = renderHook(() => useConversationMode('consult'));

    await act(async () => {
      await result.current.changeMode('assessment');
    });
    expect(result.current.mode).toBe('assessment');

    await act(async () => {
      await result.current.changeMode('consult');
    });
    expect(result.current.mode).toBe('consult');

    await act(async () => {
      await result.current.changeMode('assessment');
    });
    expect(result.current.mode).toBe('assessment');
  });

  it('exposes changeMode function', () => {
    const { result } = renderHook(() => useConversationMode());

    expect(result.current.changeMode).toBeDefined();
    expect(typeof result.current.changeMode).toBe('function');
  });

  it('returns all expected properties', () => {
    const { result } = renderHook(() => useConversationMode());

    expect(result.current).toHaveProperty('mode');
    expect(result.current).toHaveProperty('changeMode');
    expect(result.current).toHaveProperty('isChanging');
  });
});
