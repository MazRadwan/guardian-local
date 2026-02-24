/**
 * Regex Extraction Feasibility Test
 *
 * Tests the regex-based answer extraction approach against:
 * 1. A real Guardian questionnaire (mammoth raw text)
 * 2. Synthetic edge cases (embedded "Question" keywords, empty responses, etc.)
 *
 * Usage:
 *   cd packages/backend && npx tsx ../../scripts/test-regex-extraction.ts
 *
 * Cleanup:
 *   All output goes to /tmp/regex-extraction-test/ — delete that dir when done.
 *   No files created in the project directory.
 *
 * Re-run:
 *   Script is idempotent. Re-run anytime. Add edge cases to EDGE_CASES array.
 */

import * as fs from 'fs';
import * as path from 'path';
import mammoth from 'mammoth';

// ─── Config ───────────────────────────────────────────────────────────────────

const OUTPUT_DIR = '/tmp/regex-extraction-test';
const REAL_QUESTIONNAIRE = path.resolve(
  __dirname,
  '../packages/backend/uploads/363ff9a5-15b9-458b-825c-399df1d573b8/1771274357040-5ea6ab2e-questionnaire_2026_02_16_completed.docx'
);

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExtractedResponse {
  sectionNumber: number;
  questionNumber: number;
  questionText: string;
  responseText: string;
  confidence: number;
  hasVisualContent: boolean;
  visualContentDescription: string | null;
}

interface ExtractionResult {
  assessmentId: string | null;
  vendorName: string | null;
  responses: ExtractedResponse[];
  totalFound: number;
  confidence: number;
  parseTimeMs: number;
  warnings: string[];
}

/** Detects which Question blocks contain images via mammoth HTML output */
function detectImageQuestions(html: string): Map<string, boolean> {
  const result = new Map<string, boolean>();
  // Find all question blocks in HTML and check for <img> tags within each
  const questionRegex = /Question\s+(\d+)\.(\d+)/g;
  const positions: Array<{ key: string; index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = questionRegex.exec(html)) !== null) {
    positions.push({ key: `${m[1]}.${m[2]}`, index: m.index });
  }
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].index;
    const end = i + 1 < positions.length ? positions[i + 1].index : html.length;
    const block = html.substring(start, end);
    result.set(positions[i].key, block.includes('<img'));
  }
  return result;
}

// ─── The Regex Extractor (prototype) ──────────────────────────────────────────

function extractAssessmentId(text: string): string | null {
  const match = text.match(/Assessment\s+ID:\s*\n?\s*([a-f0-9-]{36})/i);
  return match ? match[1] : null;
}

function extractVendorName(text: string): string | null {
  // Vendor name is the first non-empty line after the title
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const titleIdx = lines.findIndex(l => /AI Vendor Assessment Questionnaire/i.test(l));
  if (titleIdx >= 0 && titleIdx + 1 < lines.length) {
    return lines[titleIdx + 1];
  }
  return null;
}

function regexExtract(rawText: string, expectedQuestionCount?: number, imageMap?: Map<string, boolean>): ExtractionResult {
  const start = performance.now();
  const warnings: string[] = [];

  const assessmentId = extractAssessmentId(rawText);
  const vendorName = extractVendorName(rawText);

  // Primary pattern: "Question X.Y" where X and Y are integers
  // Using a very specific pattern to minimize false positives
  const questionPattern = /^Question\s+(\d+)\.(\d+)\s*$/gm;

  // Find all question markers with their positions
  const markers: Array<{ sectionNumber: number; questionNumber: number; index: number; fullMatch: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = questionPattern.exec(rawText)) !== null) {
    markers.push({
      sectionNumber: parseInt(match[1], 10),
      questionNumber: parseInt(match[2], 10),
      index: match.index,
      fullMatch: match[0],
    });
  }

  // Extract responses between markers
  const responses: ExtractedResponse[] = [];

  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i];
    const nextMarkerIndex = i + 1 < markers.length ? markers[i + 1].index : rawText.length;

    // Get the text between this marker and the next
    const blockText = rawText.substring(marker.index + marker.fullMatch.length, nextMarkerIndex).trim();

    // Split on "Response:" to separate question text from answer
    const responseSplitPattern = /^Response:\s*$/m;
    const responseParts = blockText.split(responseSplitPattern);

    let questionText: string;
    let responseText: string;

    if (responseParts.length >= 2) {
      questionText = responseParts[0].trim();
      // Everything after "Response:" up to the next question marker
      responseText = responseParts.slice(1).join('Response:').trim();
      // Clean trailing empty lines (from the bordered box + blank lines in Word)
      responseText = responseText.replace(/\n{3,}/g, '\n\n').trim();
      // Strip trailing section headers that bled in from between questions
      // e.g., response ends with "\n\nSection 3: AI Model Risk"
      responseText = responseText.replace(/\n*Section\s+\d+:\s+[^\n]+\s*$/, '').trim();
      // Strip Guardian footer that may appear after the last question
      responseText = responseText.replace(/\n*Generated by Guardian AI Vendor Assessment System[\s\S]*$/, '').trim();
      // Strip pdf-parse page markers (e.g., "-- 1 of 1 --")
      responseText = responseText.replace(/\n*--\s*\d+\s*of\s*\d+\s*--\s*$/, '').trim();
    } else {
      // No "Response:" found — entire block is question text, no answer
      questionText = blockText.trim();
      responseText = '';
      warnings.push(`Question ${marker.sectionNumber}.${marker.questionNumber}: No "Response:" delimiter found`);
    }

    // Clean up section headers that might be in the question text
    // e.g., "Section 2: Privacy Risk\n\n\n\nActual question text"
    const sectionHeaderPattern = /^Section\s+\d+:\s+[^\n]+\n+/;
    questionText = questionText.replace(sectionHeaderPattern, '').trim();

    const qKey = `${marker.sectionNumber}.${marker.questionNumber}`;
    const hasImage = imageMap?.get(qKey) ?? false;
    const isEmptyWithImage = responseText.length === 0 && hasImage;

    responses.push({
      sectionNumber: marker.sectionNumber,
      questionNumber: marker.questionNumber,
      questionText,
      responseText,
      confidence: responseText.length > 0 ? 1.0 : (isEmptyWithImage ? 0.3 : 0.5),
      hasVisualContent: hasImage,
      visualContentDescription: hasImage
        ? (isEmptyWithImage
            ? 'Image-only response — requires Vision API for extraction'
            : 'Response contains embedded image(s) alongside text')
        : null,
    });
  }

  const totalFound = responses.length;
  const answeredCount = responses.filter(r => r.responseText.length > 0).length;

  // Overall confidence: ratio of found vs expected
  let confidence = 1.0;
  if (expectedQuestionCount && expectedQuestionCount > 0) {
    confidence = totalFound / expectedQuestionCount;
  }

  const parseTimeMs = performance.now() - start;

  return {
    assessmentId,
    vendorName,
    responses,
    totalFound,
    confidence,
    parseTimeMs,
    warnings,
  };
}

// ─── Edge Case Synthetic Documents ────────────────────────────────────────────

interface EdgeCase {
  name: string;
  description: string;
  rawText: string;
  expectedQuestions: number;
  expectedIssues: string[];
}

const EDGE_CASES: EdgeCase[] = [
  {
    name: 'vendor-writes-question-in-response',
    description: 'Vendor mentions "Question" keyword in their response text',
    rawText: `AI Vendor Assessment Questionnaire

AcmeCorp

GUARDIAN Assessment ID:
aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee

Section 1: Clinical Risk

Question 1.1

Does your system handle patient data?

Response:

Yes. A common question from our customers is "How do you handle PHI?" We have Question and Answer documents that explain our approach. Our Question Management system tracks all inquiries.

Question 1.2

How do you handle errors?

Response:

We use automated monitoring. See our FAQ page at example.com/questions for more details.

`,
    expectedQuestions: 2,
    expectedIssues: [],
  },
  {
    name: 'empty-responses',
    description: 'Vendor left some responses blank (skipped questions)',
    rawText: `AI Vendor Assessment Questionnaire

BlankCorp

GUARDIAN Assessment ID:
11111111-2222-3333-4444-555555555555

Section 1: Security

Question 1.1

What encryption do you use?

Response:

AES-256 for data at rest, TLS 1.3 for data in transit.

Question 1.2

Do you have SOC 2 certification?

Response:



Question 1.3

Describe your incident response process.

Response:

We follow NIST incident response framework with 4 phases: preparation, detection, containment, and recovery.

`,
    expectedQuestions: 3,
    expectedIssues: ['empty-response-1.2'],
  },
  {
    name: 'multi-paragraph-response',
    description: 'Vendor writes long multi-paragraph responses with bullet points',
    rawText: `AI Vendor Assessment Questionnaire

VerboseCorp

GUARDIAN Assessment ID:
22222222-3333-4444-5555-666666666666

Section 1: Privacy

Question 1.1

Describe your data governance framework.

Response:

Our data governance framework is built on several key pillars:

1. Data Classification: All data is classified into four tiers: Public, Internal, Confidential, and Restricted. Patient health information (PHI) is always classified as Restricted.

2. Access Controls: We implement role-based access control (RBAC) with the following levels:
   - Administrator: Full system access
   - Analyst: Read-only access to anonymized data
   - Support: Limited access to user accounts only

3. Data Retention: We follow these retention policies:
   - Active data: Retained for duration of contract + 1 year
   - Archived data: Encrypted and stored for 7 years per PIPEDA requirements
   - Deleted data: Securely wiped using DoD 5220.22-M standard

This framework has been reviewed and approved by our Chief Privacy Officer and external auditors from Deloitte.

Question 1.2

How do you handle cross-border data transfers?

Response:

All data remains within Canadian borders. We use AWS ca-central-1 region exclusively.

`,
    expectedQuestions: 2,
    expectedIssues: [],
  },
  {
    name: 'special-characters-unicode',
    description: 'Responses with special characters, unicode, accents',
    rawText: `AI Vendor Assessment Questionnaire

UniCorp

GUARDIAN Assessment ID:
33333333-4444-5555-6666-777777777777

Section 1: Compliance

Question 1.1

Do you support bilingual (English/French) interfaces?

Response:

Oui, notre système supporte le français et l'anglais. Les termes clés incluent: données personnelles, consentement éclairé, et responsabilité. We support the following characters: é, è, ê, ë, ç, à, â, ô, û, ù — all properly encoded in UTF-8.

Question 1.2

What standards & certifications do you hold?

Response:

We hold: ISO 27001:2022, SOC 2 Type II, PIPEDA compliance, and PHIPA (Ontario). Cost: $50,000–$75,000/year for compliance. ROI > 200%.

Symbols in our reports: ✓ compliant, ✗ non-compliant, ⚠ partial.

`,
    expectedQuestions: 2,
    expectedIssues: [],
  },
  {
    name: 'response-marker-in-answer',
    description: 'Vendor writes "Response:" in their answer text',
    rawText: `AI Vendor Assessment Questionnaire

TrickyCorp

GUARDIAN Assessment ID:
44444444-5555-6666-7777-888888888888

Section 1: Operations

Question 1.1

Describe your API response handling.

Response:

Our API follows REST conventions. Each endpoint returns a JSON response with the following structure:

Response:
{
  "status": "success",
  "data": { ... }
}

The "Response:" field in the payload indicates the operation result. We log all responses for audit purposes.

Question 1.2

What is your uptime SLA?

Response:

99.95% uptime SLA with the following breakdown:
- Core API: 99.99%
- Scheduling Service: 99.95%
- Reporting Dashboard: 99.9%

`,
    expectedQuestions: 2,
    expectedIssues: ['response-marker-in-answer-1.1'],
  },
  {
    name: 'non-sequential-numbering',
    description: 'Question numbers have gaps (some were removed from questionnaire)',
    rawText: `AI Vendor Assessment Questionnaire

GapCorp

GUARDIAN Assessment ID:
55555555-6666-7777-8888-999999999999

Section 1: Security

Question 1.1

What encryption do you use?

Response:

AES-256 everywhere.

Question 1.3

Do you have a CISO?

Response:

Yes, appointed January 2025.

Section 3: AI Model Risk

Question 3.2

How do you test for bias?

Response:

We run fairness audits quarterly using IBM AI Fairness 360 toolkit.

`,
    expectedQuestions: 3,
    expectedIssues: ['gap-1.2-missing', 'gap-3.1-missing'],
  },
];

// ─── Test Runner ──────────────────────────────────────────────────────────────

async function runRealDocTest(): Promise<void> {
  console.log('='.repeat(80));
  console.log('TEST 1: REAL QUESTIONNAIRE (SuperHealthyCan.ai, 45 questions)');
  console.log('='.repeat(80));

  if (!fs.existsSync(REAL_QUESTIONNAIRE)) {
    console.log(`SKIP: Real questionnaire not found at ${REAL_QUESTIONNAIRE}`);
    return;
  }

  const buffer = fs.readFileSync(REAL_QUESTIONNAIRE);
  const [rawResult, htmlResult] = await Promise.all([
    mammoth.extractRawText({ buffer }),
    mammoth.convertToHtml({ buffer }),
  ]);
  const rawText = rawResult.value;
  const imageMap = detectImageQuestions(htmlResult.value);

  const result = regexExtract(rawText, 45, imageMap);

  // Report image detection
  const questionsWithImages = [...imageMap.entries()].filter(([_, has]) => has);
  if (questionsWithImages.length > 0) {
    console.log(`\nQuestions with embedded images: ${questionsWithImages.length}`);
    questionsWithImages.forEach(([q]) => console.log(`  - Q${q}`));
  } else {
    console.log(`\nNo embedded images detected.`);
  }

  console.log(`\nAssessment ID: ${result.assessmentId}`);
  console.log(`Vendor Name:   ${result.vendorName}`);
  console.log(`Questions Found: ${result.totalFound} / 45 expected`);
  console.log(`Answered:      ${result.responses.filter(r => r.responseText.length > 0).length}`);
  console.log(`Confidence:    ${(result.confidence * 100).toFixed(1)}%`);
  console.log(`Parse Time:    ${result.parseTimeMs.toFixed(2)}ms`);
  console.log(`Warnings:      ${result.warnings.length}`);

  if (result.warnings.length > 0) {
    console.log('\nWarnings:');
    result.warnings.forEach(w => console.log(`  - ${w}`));
  }

  // Verify section distribution
  const sectionCounts = new Map<number, number>();
  for (const r of result.responses) {
    sectionCounts.set(r.sectionNumber, (sectionCounts.get(r.sectionNumber) || 0) + 1);
  }
  console.log('\nSection Distribution:');
  for (const [section, count] of [...sectionCounts.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  Section ${section}: ${count} questions`);
  }

  // Show first 3 and last 2 responses as samples
  console.log('\n--- Sample Responses ---');
  const samples = [...result.responses.slice(0, 3), ...result.responses.slice(-2)];
  for (const r of samples) {
    const truncated = r.responseText.length > 120
      ? r.responseText.substring(0, 120) + '...'
      : r.responseText;
    console.log(`  Q${r.sectionNumber}.${r.questionNumber}: "${r.questionText.substring(0, 60)}..."`);
    console.log(`    A: "${truncated}"`);
    console.log();
  }

  // Save full result for inspection
  const outputPath = path.join(OUTPUT_DIR, 'real-questionnaire-result.json');
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(`Full result saved to: ${outputPath}`);

  // PASS/FAIL
  const passed = result.totalFound === 45 && result.confidence >= 0.9;
  console.log(`\nRESULT: ${passed ? 'PASS ✓' : 'FAIL ✗'}`);
  if (!passed) {
    console.log(`  Expected 45 questions, got ${result.totalFound}`);
  }
}

function runEdgeCaseTests(): void {
  console.log('\n' + '='.repeat(80));
  console.log('TEST 2: EDGE CASES');
  console.log('='.repeat(80));

  const results: Array<{ name: string; passed: boolean; details: string }> = [];

  for (const tc of EDGE_CASES) {
    console.log(`\n--- ${tc.name} ---`);
    console.log(`Description: ${tc.description}`);

    const result = regexExtract(tc.rawText, tc.expectedQuestions);

    console.log(`Questions Found: ${result.totalFound} / ${tc.expectedQuestions} expected`);
    console.log(`Parse Time: ${result.parseTimeMs.toFixed(2)}ms`);
    console.log(`Assessment ID: ${result.assessmentId}`);

    const questionCountMatch = result.totalFound === tc.expectedQuestions;
    let passed = questionCountMatch;
    let details = '';

    if (!questionCountMatch) {
      details = `Expected ${tc.expectedQuestions} questions, found ${result.totalFound}`;
      console.log(`  FAIL: ${details}`);
    }

    // Show extracted responses
    for (const r of result.responses) {
      const truncQ = r.questionText.length > 50 ? r.questionText.substring(0, 50) + '...' : r.questionText;
      const truncA = r.responseText.length > 80 ? r.responseText.substring(0, 80) + '...' : r.responseText;
      const empty = r.responseText.length === 0 ? ' [EMPTY]' : '';
      const imgFlag = r.hasVisualContent ? ' [HAS IMAGE]' : '';
      console.log(`  Q${r.sectionNumber}.${r.questionNumber}: "${truncQ}"`);
      console.log(`    A: "${truncA}"${empty}${imgFlag}`);
    }

    if (result.warnings.length > 0) {
      console.log(`  Warnings: ${result.warnings.join(', ')}`);
    }

    results.push({ name: tc.name, passed, details });
    console.log(`RESULT: ${passed ? 'PASS ✓' : 'FAIL ✗'}`);
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('EDGE CASE SUMMARY');
  console.log('='.repeat(80));
  const passCount = results.filter(r => r.passed).length;
  console.log(`${passCount}/${results.length} passed`);
  for (const r of results) {
    console.log(`  ${r.passed ? '✓' : '✗'} ${r.name}${r.details ? ` — ${r.details}` : ''}`);
  }
}

// ─── Test 3: Real DOCX with Images ───────────────────────────────────────────

async function runImageDocxTest(): Promise<void> {
  console.log('\n' + '='.repeat(80));
  console.log('TEST 3: DOCX WITH EMBEDDED IMAGES (vendor pastes diagrams)');
  console.log('='.repeat(80));

  // docx package lives in backend workspace — need require from there
  const { createRequire } = await import('module');
  const backendRequire = createRequire(path.resolve(__dirname, '../packages/backend/package.json'));
  const { Document, Paragraph, TextRun, ImageRun, Packer } = backendRequire('docx');

  // Create a 1x1 red pixel PNG
  const redPixelPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    'base64'
  );

  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: 'AI Vendor Assessment Questionnaire' }),
        new Paragraph({ text: 'ImageVendor Inc.' }),
        new Paragraph({ text: '' }),
        new Paragraph({ children: [new TextRun('GUARDIAN Assessment ID:')] }),
        new Paragraph({ text: '66666666-7777-8888-9999-aaaaaaaaaaaa' }),
        new Paragraph({ text: '' }),
        new Paragraph({ text: 'Section 1: Security' }),
        new Paragraph({ text: '' }),

        // Q1.1 — normal text response
        new Paragraph({ children: [new TextRun({ text: 'Question 1.1', bold: true })] }),
        new Paragraph({ text: 'What encryption standards do you use?' }),
        new Paragraph({ text: 'Response:' }),
        new Paragraph({ text: 'We use AES-256 for all data at rest and TLS 1.3 in transit.' }),
        new Paragraph({ text: '' }),

        // Q1.2 — IMAGE-ONLY response (vendor pastes infrastructure diagram)
        new Paragraph({ children: [new TextRun({ text: 'Question 1.2', bold: true })] }),
        new Paragraph({ text: 'Describe your network architecture.' }),
        new Paragraph({ text: 'Response:' }),
        new Paragraph({
          children: [
            new ImageRun({ data: redPixelPng, transformation: { width: 400, height: 300 }, type: 'png' }),
          ],
        }),
        new Paragraph({ text: '' }),

        // Q1.3 — IMAGE + TEXT (diagram with caption)
        new Paragraph({ children: [new TextRun({ text: 'Question 1.3', bold: true })] }),
        new Paragraph({ text: 'Show your data flow diagram.' }),
        new Paragraph({ text: 'Response:' }),
        new Paragraph({ text: 'Our data flow architecture is shown below:' }),
        new Paragraph({
          children: [
            new ImageRun({ data: redPixelPng, transformation: { width: 400, height: 300 }, type: 'png' }),
          ],
        }),
        new Paragraph({ text: 'Figure 1: End-to-end data flow with encryption at every hop.' }),
        new Paragraph({ text: '' }),

        // Q1.4 — normal text response after images
        new Paragraph({ children: [new TextRun({ text: 'Question 1.4', bold: true })] }),
        new Paragraph({ text: 'Do you have a disaster recovery plan?' }),
        new Paragraph({ text: 'Response:' }),
        new Paragraph({ text: 'Yes. RPO: 1 hour, RTO: 4 hours. Tested quarterly.' }),
      ],
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const docxPath = path.join(OUTPUT_DIR, 'test-with-images.docx');
  fs.writeFileSync(docxPath, buffer);

  // Extract with mammoth (both raw text and HTML)
  const [rawResult, htmlResult] = await Promise.all([
    mammoth.extractRawText({ buffer }),
    mammoth.convertToHtml({ buffer }),
  ]);

  const imageMap = detectImageQuestions(htmlResult.value);
  const result = regexExtract(rawResult.value, 4, imageMap);

  console.log(`\nAssessment ID: ${result.assessmentId}`);
  console.log(`Vendor Name:   ${result.vendorName}`);
  console.log(`Questions Found: ${result.totalFound} / 4 expected`);
  console.log(`Parse Time:    ${result.parseTimeMs.toFixed(2)}ms`);

  // Show all responses with image flags
  for (const r of result.responses) {
    const truncA = r.responseText.length > 100 ? r.responseText.substring(0, 100) + '...' : r.responseText;
    const flags: string[] = [];
    if (r.responseText.length === 0) flags.push('EMPTY');
    if (r.hasVisualContent) flags.push('HAS IMAGE');
    if (r.visualContentDescription) flags.push(r.visualContentDescription);
    const flagStr = flags.length > 0 ? ` [${flags.join(' | ')}]` : '';
    console.log(`\n  Q${r.sectionNumber}.${r.questionNumber}: "${r.questionText}"`);
    console.log(`    A: "${truncA}"${flagStr}`);
    console.log(`    Confidence: ${r.confidence}`);
  }

  // Verify expectations
  const q12 = result.responses.find(r => r.sectionNumber === 1 && r.questionNumber === 2);
  const q13 = result.responses.find(r => r.sectionNumber === 1 && r.questionNumber === 3);

  const checks = [
    { name: 'Found all 4 questions', pass: result.totalFound === 4 },
    { name: 'Q1.1 has text, no image', pass: result.responses[0]?.responseText.includes('AES-256') && !result.responses[0]?.hasVisualContent },
    { name: 'Q1.2 flagged as image-only', pass: q12?.hasVisualContent === true && q12?.responseText === '' },
    { name: 'Q1.2 confidence lowered (0.3)', pass: q12?.confidence === 0.3 },
    { name: 'Q1.3 has text + image flag', pass: q13?.hasVisualContent === true && (q13?.responseText.length ?? 0) > 0 },
    { name: 'Q1.4 has text, no image', pass: result.responses[3]?.responseText.includes('RPO') && !result.responses[3]?.hasVisualContent },
  ];

  console.log('\n--- Verification ---');
  let allPassed = true;
  for (const c of checks) {
    console.log(`  ${c.pass ? '✓' : '✗'} ${c.name}`);
    if (!c.pass) allPassed = false;
  }

  console.log(`\nRESULT: ${allPassed ? 'PASS ✓' : 'FAIL ✗'}`);
  if (allPassed) {
    console.log('  Image detection works via mammoth HTML comparison.');
    console.log('  Image-only responses flagged for Vision API fallback.');
  }
}

// ─── Test 4: PDF Questionnaire (Word → PDF scenario) ─────────────────────────

async function runPdfTest(): Promise<void> {
  console.log('\n' + '='.repeat(80));
  console.log('TEST 4: PDF QUESTIONNAIRE (simulates Word → Print to PDF)');
  console.log('='.repeat(80));

  // Step 1: Create a questionnaire PDF using pdfkit (loaded from backend workspace)
  const { createRequire: createReq } = await import('module');
  const bReq = createReq(path.resolve(__dirname, '../packages/backend/package.json'));
  const PDFDocument = bReq('pdfkit');

  const pdfPath = path.join(OUTPUT_DIR, 'test-questionnaire.pdf');
  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    doc.fontSize(16).font('Helvetica-Bold').text('AI Vendor Assessment Questionnaire', { align: 'center' });
    doc.moveDown();
    doc.fontSize(14).text('PDFTestVendor', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).font('Helvetica');
    doc.text('GUARDIAN Assessment ID:');
    doc.text('77777777-8888-9999-aaaa-bbbbbbbbbbbb');
    doc.moveDown();

    doc.fontSize(12).font('Helvetica-Bold').text('Section 1: Clinical Risk');
    doc.moveDown();

    doc.font('Helvetica-Bold').fontSize(10).text('Question 1.1');
    doc.font('Helvetica').text('Does the chatbot provide any medical advice, symptom triage recommendations, or clinical decision support beyond administrative scheduling?');
    doc.moveDown(0.3);
    doc.text('Response:');
    doc.text('No. The chatbot is designed solely for administrative scheduling tasks including booking, rescheduling, and cancelling appointments. However, the chatbot does use natural language understanding to interpret patient requests.');
    doc.moveDown();

    doc.font('Helvetica-Bold').text('Question 1.2');
    doc.font('Helvetica').text('What mechanisms prevent clinical advice?');
    doc.moveDown(0.3);
    doc.text('Response:');
    doc.text('We have keyword filtering with 89% accuracy. Our Question Management system also flags edge cases.');
    doc.moveDown();

    doc.fontSize(12).font('Helvetica-Bold').text('Section 2: Privacy Risk');
    doc.moveDown();

    doc.font('Helvetica-Bold').fontSize(10).text('Question 2.1');
    doc.font('Helvetica').text('How is patient data encrypted?');
    doc.moveDown(0.3);
    doc.text('Response:');
    doc.text('AES-256 at rest, TLS 1.3 in transit.');
    doc.moveDown();

    doc.fontSize(8).font('Helvetica').text('Generated by Guardian AI Vendor Assessment System', { align: 'center' });
    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  console.log(`PDF created: ${fs.statSync(pdfPath).size} bytes`);

  // Step 2: Extract text via pdf-parse (same lib the backend uses)
  const { PDFParse } = bReq('pdf-parse');

  const pdfBuffer = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: pdfBuffer });
  let pdfText: string;
  try {
    const result = await parser.getText();
    pdfText = result.text;
  } finally {
    await parser.destroy();
  }

  console.log(`PDF text extracted: ${pdfText.length} chars`);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'pdf-parse-output.txt'), pdfText);

  // Step 3: Run regex extraction on PDF text
  const result = regexExtract(pdfText, 3);

  console.log(`\nAssessment ID: ${result.assessmentId}`);
  console.log(`Vendor Name:   ${result.vendorName}`);
  console.log(`Questions Found: ${result.totalFound} / 3 expected`);
  console.log(`Parse Time:    ${result.parseTimeMs.toFixed(2)}ms`);
  console.log(`Warnings:      ${result.warnings.length}`);

  for (const r of result.responses) {
    const truncA = r.responseText.length > 100 ? r.responseText.substring(0, 100) + '...' : r.responseText;
    const empty = r.responseText.length === 0 ? ' [EMPTY]' : '';
    console.log(`\n  Q${r.sectionNumber}.${r.questionNumber}: "${r.questionText.substring(0, 70)}..."`);
    console.log(`    A: "${truncA}"${empty}`);
  }

  if (result.warnings.length > 0) {
    console.log('\nWarnings:');
    result.warnings.forEach(w => console.log(`  - ${w}`));
  }

  // Verify
  const passed = result.totalFound === 3 && result.assessmentId === '77777777-8888-9999-aaaa-bbbbbbbbbbbb';
  console.log(`\nRESULT: ${passed ? 'PASS ✓' : 'FAIL ✗'}`);

  if (!passed) {
    console.log('\n--- PDF RAW TEXT (for debugging) ---');
    console.log(pdfText.substring(0, 2000));
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Setup output dir
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`Output directory: ${OUTPUT_DIR}`);
  console.log(`Cleanup: rm -rf ${OUTPUT_DIR}\n`);

  await runRealDocTest();
  runEdgeCaseTests();
  await runImageDocxTest();
  await runPdfTest();

  console.log('\n' + '='.repeat(80));
  console.log('DONE — All test output in /tmp/regex-extraction-test/');
  console.log('Add edge cases to EDGE_CASES array and re-run.');
  console.log('='.repeat(80));
}

main().catch(console.error);
