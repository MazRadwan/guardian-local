const React = require('react');

/**
 * Mock ReactMarkdown that parses basic markdown syntax and renders proper HTML elements.
 * This allows tests to verify heading/hr styling via custom components.
 */
module.exports = function ReactMarkdown({ children, components = {} }) {
  if (!children || typeof children !== 'string') {
    return React.createElement('div', null, children);
  }

  // Parse markdown content into elements
  const lines = children.split('\n');
  const elements = [];
  let currentList = [];
  let inList = false;

  const flushList = () => {
    if (currentList.length > 0) {
      const listItems = currentList.map((item, i) =>
        React.createElement('li', { key: `li-${i}` }, item)
      );
      elements.push(React.createElement('ol', { key: `ol-${elements.length}` }, listItems));
      currentList = [];
      inList = false;
    }
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    // H2 heading: ## Title
    if (trimmed.startsWith('## ')) {
      flushList();
      const text = trimmed.slice(3);
      const HeadingComponent = components.h2;
      if (HeadingComponent) {
        elements.push(React.createElement(HeadingComponent, { key: `h2-${index}`, node: {} }, text));
      } else {
        elements.push(React.createElement('h2', { key: `h2-${index}` }, text));
      }
      return;
    }

    // H3 heading: ### Title
    if (trimmed.startsWith('### ')) {
      flushList();
      const text = trimmed.slice(4);
      const HeadingComponent = components.h3;
      if (HeadingComponent) {
        elements.push(React.createElement(HeadingComponent, { key: `h3-${index}`, node: {} }, text));
      } else {
        elements.push(React.createElement('h3', { key: `h3-${index}` }, text));
      }
      return;
    }

    // Horizontal rule: ---
    if (trimmed === '---') {
      flushList();
      const HrComponent = components.hr;
      if (HrComponent) {
        elements.push(React.createElement(HrComponent, { key: `hr-${index}`, node: {} }));
      } else {
        elements.push(React.createElement('hr', { key: `hr-${index}` }));
      }
      return;
    }

    // Numbered list item: 1. Item
    const listMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (listMatch) {
      inList = true;
      currentList.push(listMatch[1]);
      return;
    }

    // Empty line
    if (trimmed === '') {
      flushList();
      return;
    }

    // Regular paragraph
    flushList();
    // Handle bold: **text**
    let content = trimmed;
    if (content.includes('**')) {
      const parts = [];
      let remaining = content;
      let partKey = 0;
      while (remaining.includes('**')) {
        const start = remaining.indexOf('**');
        const end = remaining.indexOf('**', start + 2);
        if (end === -1) break;

        if (start > 0) {
          parts.push(remaining.slice(0, start));
        }
        parts.push(React.createElement('strong', { key: `strong-${partKey++}` }, remaining.slice(start + 2, end)));
        remaining = remaining.slice(end + 2);
      }
      if (remaining) {
        parts.push(remaining);
      }
      content = parts;
    }
    // Handle italic: *text*
    if (typeof content === 'string' && content.includes('*')) {
      const parts = [];
      let remaining = content;
      let partKey = 0;
      while (remaining.includes('*')) {
        const start = remaining.indexOf('*');
        const end = remaining.indexOf('*', start + 1);
        if (end === -1) break;

        if (start > 0) {
          parts.push(remaining.slice(0, start));
        }
        parts.push(React.createElement('em', { key: `em-${partKey++}` }, remaining.slice(start + 1, end)));
        remaining = remaining.slice(end + 1);
      }
      if (remaining) {
        parts.push(remaining);
      }
      content = parts;
    }
    elements.push(React.createElement('p', { key: `p-${index}` }, content));
  });

  flushList();

  return React.createElement('div', null, elements);
};

module.exports.default = module.exports;
