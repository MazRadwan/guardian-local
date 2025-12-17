/**
 * Mock for uuid package (ESM-only)
 * Used to avoid Jest ESM transformation issues
 */

let counter = 0;

export function v4(): string {
  counter++;
  return `mock-uuid-${counter}-${Date.now()}`;
}

// Reset counter between tests
export function __resetCounter(): void {
  counter = 0;
}
