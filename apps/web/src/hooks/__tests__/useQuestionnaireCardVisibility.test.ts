import { renderHook } from '@testing-library/react';
import { useQuestionnaireCardVisibility } from '../useQuestionnaireCardVisibility';
import { RefObject } from 'react';

describe('useQuestionnaireCardVisibility', () => {
  let mockObserve: jest.Mock;
  let mockDisconnect: jest.Mock;
  let mockIntersectionObserver: jest.Mock;

  beforeEach(() => {
    mockObserve = jest.fn();
    mockDisconnect = jest.fn();

    // Mock IntersectionObserver
    mockIntersectionObserver = jest.fn((callback) => ({
      observe: mockObserve,
      disconnect: mockDisconnect,
      unobserve: jest.fn(),
      takeRecords: jest.fn(),
      root: null,
      rootMargin: '',
      thresholds: [],
    }));

    global.IntersectionObserver = mockIntersectionObserver as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns true by default when refs are ready', () => {
    const cardRef: RefObject<HTMLDivElement> = { current: document.createElement('div') };
    const containerRef: RefObject<HTMLDivElement> = { current: document.createElement('div') };

    const { result } = renderHook(() =>
      useQuestionnaireCardVisibility(cardRef, containerRef)
    );

    expect(result.current).toBe(true);
    expect(mockObserve).toHaveBeenCalledWith(cardRef.current);
  });

  it('returns true when card is in view', () => {
    const cardRef: RefObject<HTMLDivElement> = { current: document.createElement('div') };
    const containerRef: RefObject<HTMLDivElement> = { current: document.createElement('div') };

    let observerCallback: IntersectionObserverCallback | null = null;
    mockIntersectionObserver.mockImplementation((callback) => {
      observerCallback = callback;
      return {
        observe: mockObserve,
        disconnect: mockDisconnect,
        unobserve: jest.fn(),
        takeRecords: jest.fn(),
        root: null,
        rootMargin: '',
        thresholds: [],
      };
    });

    const { result } = renderHook(() =>
      useQuestionnaireCardVisibility(cardRef, containerRef)
    );

    // Trigger intersection observer callback with isIntersecting: true
    if (observerCallback) {
      observerCallback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    }

    expect(result.current).toBe(true);
  });

  it('returns false when card is scrolled out of view', () => {
    const cardRef: RefObject<HTMLDivElement> = { current: document.createElement('div') };
    const containerRef: RefObject<HTMLDivElement> = { current: document.createElement('div') };

    let observerCallback: IntersectionObserverCallback | null = null;
    mockIntersectionObserver.mockImplementation((callback) => {
      observerCallback = callback;
      return {
        observe: mockObserve,
        disconnect: mockDisconnect,
        unobserve: jest.fn(),
        takeRecords: jest.fn(),
        root: null,
        rootMargin: '',
        thresholds: [],
      };
    });

    const { result, rerender } = renderHook(() =>
      useQuestionnaireCardVisibility(cardRef, containerRef)
    );

    // Trigger intersection observer callback with isIntersecting: false
    if (observerCallback) {
      observerCallback(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    }

    // Force re-render to see the state update
    rerender();

    expect(result.current).toBe(false);
  });

  it('returns true when refs are not ready (null)', () => {
    const cardRef: RefObject<HTMLDivElement> = { current: null };
    const containerRef: RefObject<HTMLDivElement> = { current: null };

    const { result } = renderHook(() =>
      useQuestionnaireCardVisibility(cardRef, containerRef)
    );

    expect(result.current).toBe(true);
    expect(mockObserve).not.toHaveBeenCalled();
  });

  it('returns true when card ref is null but container is ready', () => {
    const cardRef: RefObject<HTMLDivElement> = { current: null };
    const containerRef: RefObject<HTMLDivElement> = { current: document.createElement('div') };

    const { result } = renderHook(() =>
      useQuestionnaireCardVisibility(cardRef, containerRef)
    );

    expect(result.current).toBe(true);
    expect(mockObserve).not.toHaveBeenCalled();
  });

  it('returns true when container ref is null but card is ready', () => {
    const cardRef: RefObject<HTMLDivElement> = { current: document.createElement('div') };
    const containerRef: RefObject<HTMLDivElement> = { current: null };

    const { result } = renderHook(() =>
      useQuestionnaireCardVisibility(cardRef, containerRef)
    );

    expect(result.current).toBe(true);
    expect(mockObserve).not.toHaveBeenCalled();
  });

  it('disconnects observer on unmount', () => {
    const cardRef: RefObject<HTMLDivElement> = { current: document.createElement('div') };
    const containerRef: RefObject<HTMLDivElement> = { current: document.createElement('div') };

    const { unmount } = renderHook(() =>
      useQuestionnaireCardVisibility(cardRef, containerRef)
    );

    unmount();

    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('creates observer with correct options', () => {
    const cardRef: RefObject<HTMLDivElement> = { current: document.createElement('div') };
    const containerRef: RefObject<HTMLDivElement> = { current: document.createElement('div') };

    renderHook(() => useQuestionnaireCardVisibility(cardRef, containerRef));

    expect(mockIntersectionObserver).toHaveBeenCalledWith(
      expect.any(Function),
      {
        root: containerRef.current,
        threshold: 0.1,
      }
    );
  });

  it('attaches observer when refs become ready after initial render', () => {
    // Start with null refs
    const cardRef: RefObject<HTMLDivElement> = { current: null };
    const containerRef: RefObject<HTMLDivElement> = { current: null };

    const { result, rerender } = renderHook(() =>
      useQuestionnaireCardVisibility(cardRef, containerRef)
    );

    // Initially returns true (optimistic default), no observer
    expect(result.current).toBe(true);
    expect(mockObserve).not.toHaveBeenCalled();

    // Simulate refs becoming ready (e.g., card component mounts)
    (cardRef as any).current = document.createElement('div');
    (containerRef as any).current = document.createElement('div');

    // Re-render to trigger state sync
    rerender();

    // Now observer should be attached
    expect(mockObserve).toHaveBeenCalled();
  });
});
