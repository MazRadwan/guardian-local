# Document Extraction Benchmark

Benchmark script for testing PDF and DOCX extraction times against Guardian's 3-second SLO.

## Setup

```bash
cd benchmark
npm install
```

## Usage

```bash
# Single file
node extraction-benchmark.js ../path/to/test.pdf
node extraction-benchmark.js ../path/to/test.docx

# Multiple files
node extraction-benchmark.js file1.docx file2.pdf file3.docx

# Glob patterns (shell expansion)
node extraction-benchmark.js *.pdf *.docx
node extraction-benchmark.js ../test-files/*.pdf
```

## Output

The script outputs a table with the following columns:

| Column | Description |
|--------|-------------|
| File | Filename being tested |
| Size | File size (human readable) |
| Time | Extraction time |
| Text Len | Total extracted text length |
| Excerpt | Truncated text length (max 10,000 chars) |
| Status | PASS, SLOW, FAIL, or SKIP |

### Status Codes

- `[OK]` PASS - Extraction completed within 3-second SLO
- `[!!]` SLOW - Extraction completed but exceeded 3-second SLO
- `[XX]` FAIL - Extraction failed (timeout, parse error, etc.)
- `[--]` SKIP - Unsupported file type

## Exit Codes

- `0` - All files passed (within SLO)
- `1` - One or more files failed or exceeded SLO

## SLO Configuration

The script uses Guardian's production SLO values:

- **Timeout:** 3000ms (3 seconds)
- **Max Excerpt:** 10,000 characters

## Libraries

Uses the same versions as Guardian:

- `pdf-parse` v2.4.5 (class-based API)
- `mammoth` v1.11.0

## Example Output

```
Benchmarking 3 file(s)...

========================================
  Document Extraction Benchmark Results
========================================

SLO Target: 3000ms
Max Excerpt: 10,000 chars

File                 |       Size |       Time |     Text Len |      Excerpt | Status
---------------------------------------------------------------------------------------
test-small.pdf       |    125 KB  |      45ms  |       8,234  |       8,234  |   [OK]
test-large.pdf       |    5.2 MB  |    2,340ms |     245,678  |      10,000  |   [OK]
test-huge.pdf        |   15.8 MB  |    4,521ms |     892,345  |      10,000  |   [!!]
  -> Exceeded 3000ms SLO
---------------------------------------------------------------------------------------

Summary: 2 passed, 1 slow, 0 failed, 0 skipped
```

## Finding Test Files

If you need test documents:

1. **Small files (<100KB):** Create simple PDFs/DOCX locally
2. **Medium files (100KB-1MB):** Use sample documents from test suites
3. **Large files (>1MB):** Download sample PDFs from:
   - https://www.africau.edu/images/default/sample.pdf
   - Any public government PDF forms

## Troubleshooting

### "Cannot find module 'pdf-parse'"

Run `npm install` in the benchmark directory first.

### Timeout errors on valid files

The file may be too large for the 3-second SLO. This is expected behavior - the benchmark is showing you that this file would fail in production.

### Parse errors

- Ensure the file is a valid PDF or DOCX
- Check if the file is password-protected (not supported)
- Verify the file isn't corrupted
