/**
 * Mock for marked library (ESM module)
 */

export const marked = {
  parse: (markdown: string) => {
    // Simple mock implementation that converts markdown to HTML
    return markdown
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*)\*/gim, '<em>$1</em>')
      .replace(/\n/g, '<br>')
  },
  setOptions: () => {},
}
