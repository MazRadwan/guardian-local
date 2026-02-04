/**
 * Unit tests for webSearchTool
 *
 * Part of Epic 33: Consult Search Tool
 *
 * Tests validate the tool schema structure and ensure:
 * - Tool has correct name and description
 * - Input schema is properly defined
 * - consultModeTools is correctly configured
 * - No overlap with assessmentModeTools
 */

import {
  webSearchTool,
  consultModeTools,
} from '../../src/infrastructure/ai/tools/webSearchTool.js';
import { assessmentModeTools } from '../../src/infrastructure/ai/tools/questionnaireReadyTool.js';

describe('webSearchTool', () => {
  describe('tool metadata', () => {
    it('should have correct tool name', () => {
      expect(webSearchTool.name).toBe('web_search');
    });

    it('should have a description', () => {
      expect(webSearchTool.description).toBeDefined();
      expect(webSearchTool.description.length).toBeGreaterThan(50);
    });

    it('should mention citations in description', () => {
      expect(webSearchTool.description.toLowerCase()).toContain('citations');
    });

    it('should mention recent events in description', () => {
      expect(webSearchTool.description.toLowerCase()).toContain('recent');
    });

    it('should mention sources in description', () => {
      expect(webSearchTool.description.toLowerCase()).toContain('sources');
    });

    it('should mention training data in description', () => {
      expect(webSearchTool.description.toLowerCase()).toContain('training data');
    });
  });

  describe('input_schema structure', () => {
    const schema = webSearchTool.input_schema;

    it('should be an object type', () => {
      expect(schema.type).toBe('object');
    });

    it('should require query', () => {
      expect(schema.required).toContain('query');
    });

    it('should only require query (not max_results)', () => {
      expect(schema.required).toHaveLength(1);
      expect(schema.required).not.toContain('max_results');
    });
  });

  describe('query property', () => {
    const props = webSearchTool.input_schema.properties as Record<string, any>;

    it('should be a string type', () => {
      expect(props.query.type).toBe('string');
    });

    it('should have a description', () => {
      expect(props.query.description).toBeDefined();
      expect(props.query.description.length).toBeGreaterThan(0);
    });

    it('should have minLength constraint of 1', () => {
      expect(props.query.minLength).toBe(1);
    });

    it('should have maxLength constraint of 500', () => {
      expect(props.query.maxLength).toBe(500);
    });
  });

  describe('max_results property', () => {
    const props = webSearchTool.input_schema.properties as Record<string, any>;

    it('should be a number type', () => {
      expect(props.max_results.type).toBe('number');
    });

    it('should have a description', () => {
      expect(props.max_results.description).toBeDefined();
      expect(props.max_results.description.length).toBeGreaterThan(0);
    });

    it('should have minimum constraint of 1', () => {
      expect(props.max_results.minimum).toBe(1);
    });

    it('should have maximum constraint of 10', () => {
      expect(props.max_results.maximum).toBe(10);
    });
  });
});

describe('consultModeTools', () => {
  it('should be an array', () => {
    expect(Array.isArray(consultModeTools)).toBe(true);
  });

  it('should contain webSearchTool', () => {
    expect(consultModeTools).toContain(webSearchTool);
  });

  it('should have exactly 1 tool (currently)', () => {
    expect(consultModeTools).toHaveLength(1);
  });

  it('should NOT contain any assessmentModeTools items', () => {
    for (const assessmentTool of assessmentModeTools) {
      expect(consultModeTools).not.toContain(assessmentTool);
    }
  });

  it('should be separate from assessmentModeTools array reference', () => {
    expect(consultModeTools).not.toBe(assessmentModeTools);
  });
});

describe('webSearchTool vs assessmentModeTools separation', () => {
  it('should not have webSearchTool in assessmentModeTools', () => {
    const assessmentToolNames = assessmentModeTools.map((t) => t.name);
    expect(assessmentToolNames).not.toContain('web_search');
  });

  it('should not have assessment tools in consultModeTools', () => {
    const consultToolNames = consultModeTools.map((t) => t.name);
    expect(consultToolNames).not.toContain('questionnaire_ready');
  });
});
