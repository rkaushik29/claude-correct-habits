#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * @typedef {'naming' | 'error-handling' | 'architecture' | 'testing' | 'style' | 'imports' | 'other'} PatternCategory
 */

/**
 * @typedef {Object} Pattern
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {PatternCategory} category
 * @property {string} [bad_example]
 * @property {string} [good_example]
 * @property {number} confidence
 * @property {string} [reasoning]
 * @property {string} createdAt
 * @property {number} hitCount
 */

/**
 * @typedef {Object} PatternsData
 * @property {Pattern[]} patterns
 * @property {number} version
 */

/**
 * @typedef {Object} HookInput
 * @property {string} [message]
 * @property {string} [prompt]
 * @property {string} [content]
 */

/**
 * @typedef {Object} CorrectionSignal
 * @property {RegExp} pattern
 * @property {number} weight - Higher = stronger signal (0-1)
 * @property {PatternCategory} [categoryHint] - Likely category if matched
 */

/**
 * @typedef {Object} DetectionResult
 * @property {boolean} isCorrection
 * @property {number} confidence - 0-1 score
 * @property {PatternCategory[]} categoryHints
 * @property {boolean} skipLearning - User explicitly doesn't want this learned
 */

const PATTERNS_FILE = path.join(process.cwd(), '.claude', 'correct-habits', 'patterns.json');

const MIN_MESSAGE_LENGTH = 15;
const MIN_CONFIDENCE = 0.4;

/**
 * Signals that indicate user does NOT want this learned
 * @type {RegExp[]}
 */
const skipSignals = [
  /just\s*(this\s*)?(once|time|here|case)/i,
  /only\s*(for\s*)?(this|here|now)/i,
  /this\s*(specific|particular)\s*(case|instance|time)/i,
  /don'?t\s*(remember|learn|save)\s*(this|that)/i,
  /exception/i,
  /one-?off/i,
  /temporary|temp\s+fix/i,
];

/**
 * Weighted correction signals - higher weight = stronger indicator
 * @type {CorrectionSignal[]}
 */
const correctionSignals = [
  // Strong signals (0.8-1.0) - explicit conventions/standards
  { pattern: /\b(we|our)\s+(always|never)\b/i, weight: 0.95 },
  { pattern: /\b(our|the)\s+(convention|standard|pattern|style|approach)\b/i, weight: 0.9 },
  { pattern: /\b(company|team|project)\s+(standard|convention|rule)/i, weight: 0.9 },
  { pattern: /\bwe\s+(don'?t|do not)\s+(use|allow|permit)/i, weight: 0.85 },
  { pattern: /\balways\s+use\b/i, weight: 0.8 },
  { pattern: /\bnever\s+use\b/i, weight: 0.8 },

  // Medium signals (0.5-0.7) - preferences and corrections
  { pattern: /\binstead\s+(of|use)\b/i, weight: 0.7 },
  { pattern: /\bprefer\s+\w+\s+(over|to|instead)/i, weight: 0.7 },
  { pattern: /\bshould\s+(always|never)\b/i, weight: 0.65 },
  { pattern: /\bi\s+(always|never|prefer)\b/i, weight: 0.6 },
  { pattern: /\bthat'?s\s+(not|wrong|incorrect)\b/i, weight: 0.55 },
  { pattern: /\bwrong\s+(approach|pattern|way)\b/i, weight: 0.55 },
  { pattern: /\bdon'?t\s+(do|use|write)\s+(it\s+)?(like\s+)?that\b/i, weight: 0.5 },

  // Weak signals (0.2-0.4) - might be one-off fixes
  { pattern: /\bplease\s+(don'?t|change|use)\b/i, weight: 0.35 },
  { pattern: /\bshould\s+(be|have|use)\b/i, weight: 0.3 },
  { pattern: /\bno,?\s*(actually|don'?t)\b/i, weight: 0.3 },
  { pattern: /\bfix\s+(this|that|the)\b/i, weight: 0.2 },

  // Category-specific signals with hints
  { pattern: /\b(name|naming|call\s+it|rename)\b/i, weight: 0.4, categoryHint: 'naming' },
  { pattern: /\b(import|require|from\s+['"])/i, weight: 0.4, categoryHint: 'imports' },
  { pattern: /\b(test|spec|describe|it\s*\()/i, weight: 0.4, categoryHint: 'testing' },
  { pattern: /\b(try|catch|throw|error|exception)\b/i, weight: 0.35, categoryHint: 'error-handling' },
  { pattern: /\b(folder|directory|structure|organize)/i, weight: 0.35, categoryHint: 'architecture' },
  { pattern: /\b(format|indent|spacing|style|prettier|eslint)/i, weight: 0.35, categoryHint: 'style' },
];

/**
 * Boost confidence if message contains code (corrections with code are more pattern-like)
 * @param {string} message
 * @returns {number} Multiplier (1.0-1.3)
 */
function getCodeBoost(message) {
  const hasCodeBlock = /```[\s\S]*```/.test(message);
  const hasInlineCode = /`[^`]+`/.test(message);
  const hasCodeIndicators = /[{};=>\[\]().]/.test(message) && message.length > 30;

  if (hasCodeBlock) return 1.3;
  if (hasInlineCode) return 1.15;
  if (hasCodeIndicators) return 1.05;
  return 1.0;
}

/**
 * Analyze message to detect if it's a correction worth learning from
 * @param {string} message
 * @returns {DetectionResult}
 */
function analyzeMessage(message) {
  const result = {
    isCorrection: false,
    confidence: 0,
    categoryHints: /** @type {PatternCategory[]} */ ([]),
    skipLearning: false,
  };

  // Quick exit for very short messages
  if (message.length < MIN_MESSAGE_LENGTH) {
    return result;
  }

  // Check if user explicitly doesn't want this learned
  if (skipSignals.some(regex => regex.test(message))) {
    result.skipLearning = true;
    return result;
  }

  // Calculate weighted confidence score
  let totalWeight = 0;
  let maxWeight = 0;
  const hints = new Set();

  for (const signal of correctionSignals) {
    if (signal.pattern.test(message)) {
      totalWeight += signal.weight;
      maxWeight = Math.max(maxWeight, signal.weight);
      if (signal.categoryHint) {
        hints.add(signal.categoryHint);
      }
    }
  }

  // Use max weight as base, add bonus for multiple signals (capped)
  const multiSignalBonus = Math.min((totalWeight - maxWeight) * 0.3, 0.2);
  let confidence = maxWeight + multiSignalBonus;
  confidence *= getCodeBoost(message);
  confidence = Math.min(confidence, 1.0);

  result.confidence = confidence;
  result.isCorrection = confidence >= MIN_CONFIDENCE;
  result.categoryHints = /** @type {PatternCategory[]} */ ([...hints]);

  return result;
}

/**
 * Load existing patterns (only when needed)
 * @returns {string} Comma-separated pattern names or 'none'
 */
function getExistingPatternNames() {
  if (!fs.existsSync(PATTERNS_FILE)) {
    return 'none';
  }
  try {
    /** @type {PatternsData} */
    const data = JSON.parse(fs.readFileSync(PATTERNS_FILE, 'utf8'));
    if (data.patterns.length === 0) return 'none';
    // Only return last 10 to keep prompt short
    return data.patterns.slice(-10).map(p => p.name).join(', ');
  } catch {
    return 'none';
  }
}

/**
 * Generate the learning instruction based on detection result
 * @param {DetectionResult} detection
 * @param {string} existingPatterns
 * @returns {string}
 */
function generateInstruction(detection, existingPatterns) {
  const confidenceLabel = detection.confidence >= 0.8 ? 'HIGH'
    : detection.confidence >= 0.6 ? 'MEDIUM' : 'LOW';

  const categoryHint = detection.categoryHints.length > 0
    ? `Likely category: ${detection.categoryHints.join(' or ')}`
    : '';

  return `<pattern-learning-hook>
    CORRECTION DETECTED (${confidenceLabel} confidence)

    After addressing the user's request, evaluate if this reveals a REUSABLE pattern:

    YES (save it):
    - Naming conventions, style preferences, architectural choices
    - Library/framework preferences, error handling approaches
    - Team/project standards mentioned

    NO (skip):
    - One-time bug fixes, typos, project-specific details
    - Already exists: ${existingPatterns}

    ${categoryHint}

    If saving: Write to .claude/correct-habits/patterns.json
    Format: {id: "pat_[timestamp]_[random]", name: "kebab-case", description, category, bad_example, good_example, confidence: ${detection.confidence.toFixed(2)}, createdAt: ISO, hitCount: 0}

    End with: [Learned: pattern-name] or nothing if skipped.
    </pattern-learning-hook>`;
}

/**
 * Main entry point
 */
function main() {
  // Parse stdin
  let input = '';
  try {
    input = fs.readFileSync('/dev/stdin', 'utf8');
  } catch {
    process.exit(0);
  }

  if (!input.trim()) {
    process.exit(0);
  }

  /** @type {HookInput} */
  let hookInput;
  try {
    hookInput = JSON.parse(input);
  } catch {
    process.exit(0);
  }

  const message = hookInput.message || hookInput.prompt || hookInput.content || '';

  if (!message) {
    process.exit(0);
  }

  // Analyze the message
  const detection = analyzeMessage(message);

  // Exit early if not a correction or user wants to skip learning
  if (!detection.isCorrection || detection.skipLearning) {
    process.exit(0);
  }

  // Only load patterns file if we're actually going to inject
  const existingPatterns = getExistingPatternNames();

  // Output instruction for Claude
  console.log(JSON.stringify({
    context: generateInstruction(detection, existingPatterns),
    continue: true
  }));
}

main();
