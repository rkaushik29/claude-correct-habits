#!/usr/bin/env node
/**
 * Pattern Guardian - Real-time Correction Detector
 * Runs on each user prompt to detect corrections and trigger pattern learning
 */

const fs = require('fs');
const path = require('path');

const PATTERNS_FILE = path.join(process.cwd(), '.claude', 'correct-habits', 'patterns.json');

// Correction signals to look for
const correctionSignals = [
  /no,?\s*(actually|don't|shouldn't|never|always|instead|use|prefer)/i,
  /that's\s*(not|wrong)/i,
  /we\s*(don't|never|always|prefer)/i,
  /please\s*(don't|never|always|use)/i,
  /instead\s*(of|use)/i,
  /wrong\s*(approach|pattern|way)/i,
  /our\s*(convention|standard|pattern|style)/i,
  /should\s+(always\s+)?(be|have|use)/i,
  /fix\s*(this|that|the)/i,
  /i\s*(always|never|prefer)/i,
  /(you\s+should|always\s+use|never\s+use)/i,
];

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadPatterns() {
  ensureDir(PATTERNS_FILE);
  if (fs.existsSync(PATTERNS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(PATTERNS_FILE, 'utf8'));
    } catch (e) {
      return { patterns: [], version: 1 };
    }
  }
  return { patterns: [], version: 1 };
}

function main() {
  let hookInput;
  try {
    hookInput = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
  } catch (e) {
    // No input, continue normally
    process.exit(0);
  }

  // Get user message from hook input
  const userMessage = hookInput.message || hookInput.prompt || hookInput.content || '';

  if (!userMessage) {
    process.exit(0);
  }

  // Check if this looks like a correction
  const isCorrection = correctionSignals.some(regex => regex.test(userMessage));

  if (!isCorrection) {
    process.exit(0);
  }

  // Load existing patterns to check for duplicates
  const existingPatterns = loadPatterns();
  const patternNames = existingPatterns.patterns.map(p => p.name).join(', ') || 'none yet';

  // Inject instruction for Claude to analyze and potentially save the pattern
  const instruction = `
<pattern-learning-hook>
CORRECTION DETECTED: The user appears to be correcting your approach. After addressing their request:

1. Determine if this correction reveals a REUSABLE coding pattern (not a one-off fix).
   - Pattern examples: naming conventions, error handling style, preferred libraries, architectural preferences, testing approaches
   - NOT patterns: typo fixes, one-time bug fixes, project-specific implementation details

2. If it IS a reusable pattern with confidence > 0.7:
   - Use the Write tool to save it to: .claude/correct-habits/patterns.json (in the current project directory)
   - File format: {"patterns": [...], "version": 1}
   - Pattern fields: id (pat_timestamp_random), name (kebab-case), description, category (naming|error-handling|architecture|testing|style|imports|other), bad_example, good_example, confidence (0-1), createdAt (ISO), hitCount (0)
   - Check for duplicates first - existing patterns: ${patternNames}

3. If you save a pattern, briefly mention it at the end: "[Learned pattern: pattern-name]"

4. If it's NOT a reusable pattern (just a one-time fix), do NOT save anything.
</pattern-learning-hook>`;

  // Output JSON for Claude Code to inject into context
  const hookOutput = {
    context: instruction,
    continue: true
  };
  console.log(JSON.stringify(hookOutput));
}

main();
