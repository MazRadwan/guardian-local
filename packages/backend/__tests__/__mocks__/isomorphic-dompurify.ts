/**
 * Mock for isomorphic-dompurify
 */

export default {
  sanitize: (html: string, _options?: any) => {
    // Pass through for testing - in real tests we trust DOMPurify works
    return html
  },
}
