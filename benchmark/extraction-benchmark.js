#!/usr/bin/env node
/**
 * Document Extraction Benchmark Script
 *
 * Tests PDF and DOCX extraction times against Guardian's 3-second SLO.
 * Uses the same libraries as Guardian: pdf-parse v2.4.5 and mammoth v1.11.0
 *
 * Usage:
 *   node extraction-benchmark.js <file1> [file2] [file3] ...
 *   node extraction-benchmark.js ../path/to/test.pdf
 *   node extraction-benchmark.js file1.docx file2.pdf file3.docx
 */

const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');

// Guardian's SLO timeout
const TIMEOUT_MS = 3000;
// Guardian's max excerpt length
const MAX_EXCERPT_LENGTH = 10000;

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Format milliseconds to human readable string
 */
function formatTime(ms) {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Extract text from PDF using pdf-parse v2 class-based API
 *
 * pdf-parse v2 returns { text: string } from getText()
 */
async function extractPDF(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

/**
 * Extract text from DOCX using mammoth
 */
async function extractDOCX(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

/**
 * Run extraction with timeout
 */
async function extractWithTimeout(buffer, fileType) {
  const extractFn = fileType === 'pdf' ? extractPDF : extractDOCX;

  return Promise.race([
    extractFn(buffer),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout: exceeded ${TIMEOUT_MS}ms SLO`)), TIMEOUT_MS)
    )
  ]);
}

/**
 * Benchmark a single file
 */
async function benchmarkFile(filePath) {
  const absolutePath = path.resolve(filePath);
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();

  // Validate file type
  if (ext !== '.pdf' && ext !== '.docx') {
    return {
      file: fileName,
      size: '-',
      time: '-',
      textLength: '-',
      excerptLength: '-',
      status: 'SKIP',
      error: `Unsupported file type: ${ext}`
    };
  }

  // Check file exists
  if (!fs.existsSync(absolutePath)) {
    return {
      file: fileName,
      size: '-',
      time: '-',
      textLength: '-',
      excerptLength: '-',
      status: 'ERROR',
      error: 'File not found'
    };
  }

  const fileType = ext === '.pdf' ? 'pdf' : 'docx';
  const buffer = fs.readFileSync(absolutePath);
  const fileSize = buffer.length;

  const startTime = performance.now();

  try {
    const text = await extractWithTimeout(buffer, fileType);
    const endTime = performance.now();
    const duration = endTime - startTime;

    const excerpt = text.substring(0, MAX_EXCERPT_LENGTH);
    const withinSLO = duration <= TIMEOUT_MS;

    return {
      file: fileName,
      size: formatBytes(fileSize),
      time: formatTime(duration),
      textLength: text.length.toLocaleString(),
      excerptLength: excerpt.length.toLocaleString(),
      status: withinSLO ? 'PASS' : 'SLOW',
      error: withinSLO ? null : `Exceeded ${TIMEOUT_MS}ms SLO`
    };
  } catch (error) {
    const endTime = performance.now();
    const duration = endTime - startTime;

    return {
      file: fileName,
      size: formatBytes(fileSize),
      time: formatTime(duration),
      textLength: '-',
      excerptLength: '-',
      status: 'FAIL',
      error: error.message
    };
  }
}

/**
 * Print results as a table
 */
function printResults(results) {
  console.log('\n========================================');
  console.log('  Document Extraction Benchmark Results');
  console.log('========================================\n');
  console.log(`SLO Target: ${TIMEOUT_MS}ms`);
  console.log(`Max Excerpt: ${MAX_EXCERPT_LENGTH.toLocaleString()} chars\n`);

  // Calculate column widths
  const cols = {
    file: Math.max(20, ...results.map(r => r.file.length)),
    size: 10,
    time: 10,
    textLength: 12,
    excerptLength: 12,
    status: 6
  };

  // Header
  const header = [
    'File'.padEnd(cols.file),
    'Size'.padStart(cols.size),
    'Time'.padStart(cols.time),
    'Text Len'.padStart(cols.textLength),
    'Excerpt'.padStart(cols.excerptLength),
    'Status'.padStart(cols.status)
  ].join(' | ');

  const separator = '-'.repeat(header.length);

  console.log(header);
  console.log(separator);

  // Rows
  for (const r of results) {
    const statusIcon = r.status === 'PASS' ? '[OK]' :
                       r.status === 'SLOW' ? '[!!]' :
                       r.status === 'SKIP' ? '[--]' : '[XX]';

    const row = [
      r.file.substring(0, cols.file).padEnd(cols.file),
      r.size.padStart(cols.size),
      r.time.padStart(cols.time),
      r.textLength.padStart(cols.textLength),
      r.excerptLength.padStart(cols.excerptLength),
      statusIcon.padStart(cols.status)
    ].join(' | ');

    console.log(row);

    if (r.error && r.status !== 'PASS') {
      console.log(`  -> ${r.error}`);
    }
  }

  console.log(separator);

  // Summary
  const passed = results.filter(r => r.status === 'PASS').length;
  const slow = results.filter(r => r.status === 'SLOW').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const skipped = results.filter(r => r.status === 'SKIP').length;

  console.log(`\nSummary: ${passed} passed, ${slow} slow, ${failed} failed, ${skipped} skipped`);
  console.log('');
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Document Extraction Benchmark');
    console.log('');
    console.log('Usage:');
    console.log('  node extraction-benchmark.js <file1> [file2] [file3] ...');
    console.log('');
    console.log('Examples:');
    console.log('  node extraction-benchmark.js ../path/to/test.pdf');
    console.log('  node extraction-benchmark.js file1.docx file2.pdf');
    console.log('  node extraction-benchmark.js *.pdf *.docx');
    console.log('');
    console.log('Supported file types: .pdf, .docx');
    console.log(`SLO Target: ${TIMEOUT_MS}ms (3 seconds)`);
    process.exit(0);
  }

  console.log(`\nBenchmarking ${args.length} file(s)...`);

  const results = [];
  for (const filePath of args) {
    const result = await benchmarkFile(filePath);
    results.push(result);
  }

  printResults(results);

  // Exit with error code if any failures
  const hasFailures = results.some(r => r.status === 'FAIL' || r.status === 'SLOW');
  process.exit(hasFailures ? 1 : 0);
}

main().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
