import '@testing-library/jest-dom';

// Mock tailwind-merge - must be before imports
global.twMerge = (...args) => args.filter(Boolean).join(' ');

// Mock WebSocket
global.WebSocket = class WebSocket {
  constructor() {
    this.readyState = 1;
  }
  send() {}
  close() {}
  addEventListener() {}
  removeEventListener() {}
};

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock scrollIntoView
Element.prototype.scrollIntoView = jest.fn();
