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
 * @typedef {Object} ContextAwareSignal
 * @property {RegExp} userPattern - Pattern to match in user message
 * @property {number} weight - Base weight without context
 * @property {number} contextWeight - Weight when context validates
 * @property {function(RegExpMatchArray, LastResponse): boolean} [responseCheck] - Validates against response
 */

/**
 * @typedef {Object} LastResponse
 * @property {string} sessionId - Session identifier
 * @property {string} response - Claude's last message text
 * @property {string[]} toolsUsed - List of tools used
 * @property {string[]} filesModified - List of files modified
 * @property {string} codeWritten - Extracted code snippets
 * @property {string} timestamp - ISO timestamp
 */

/**
 * @typedef {Object} DetectionResult
 * @property {boolean} isCorrection
 * @property {number} confidence - 0-1 score
 * @property {PatternCategory[]} categoryHints
 * @property {boolean} skipLearning - User explicitly doesn't want this learned
 * @property {string} [badExample] - What Claude did wrong (from context)
 * @property {boolean} hasContext - Whether context was available
 */

const PATTERNS_FILE = path.join(process.cwd(), '.claude', 'correct-habits', 'patterns.json');
const LAST_RESPONSE_FILE = path.join(process.cwd(), '.claude', 'correct-habits', 'last-response.json');

const MIN_MESSAGE_LENGTH = 15;
const MIN_CONFIDENCE = 0.4;
const CONTEXT_STALENESS_MS = 5 * 60 * 1000; // 5 minutes

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
 * Context-aware signals - patterns that are ambiguous alone but strong with context
 * @type {ContextAwareSignal[]}
 */
const contextAwareSignals = [
  // "that's not what/how I meant/wanted" - strong if we have context
  {
    userPattern: /\bthat'?s\s+not\s+(what|how)\s+I\s+(meant|wanted)/i,
    weight: 0.3,
    contextWeight: 0.75,
  },
  // "why did you use/write/put" - questioning Claude's choice
  {
    userPattern: /\bwhy\s+did\s+you\s+(use|write|put|add|create)/i,
    weight: 0.4,
    contextWeight: 0.8,
  },
  // "instead of X" - check if X is in Claude's response
  {
    userPattern: /\binstead\s+of\s+[`'"]([\w\-_.]+)[`'"]/i,
    weight: 0.5,
    contextWeight: 0.85,
    responseCheck: (match, response) => {
      const mentioned = match[1];
      const lowerResponse = (response.response + ' ' + response.codeWritten).toLowerCase();
      return lowerResponse.includes(mentioned.toLowerCase());
    },
  },
  // "use X instead" - suggest alternative to what Claude used
  {
    userPattern: /\buse\s+[`'"]([\w\-_.]+)[`'"]\s+instead/i,
    weight: 0.5,
    contextWeight: 0.85,
    responseCheck: (match, response) => {
      const suggested = match[1];
      const lowerResponse = (response.response + ' ' + response.codeWritten).toLowerCase();
      // Strong signal if suggested is NOT in response (Claude used something else)
      return !lowerResponse.includes(suggested.toLowerCase());
    },
  },
  // "no, actually..." - disagreement with context
  {
    userPattern: /\bno,?\s*(actually|don'?t|stop)/i,
    weight: 0.25,
    contextWeight: 0.65,
  },
  // "that's wrong/incorrect" - explicit disagreement
  {
    userPattern: /\bthat'?s\s+(wrong|incorrect|not\s+right)/i,
    weight: 0.4,
    contextWeight: 0.8,
  },
  // "don't use X" - check if X was used
  {
    userPattern: /\bdon'?t\s+use\s+[`'"]([\w\-_.]+)[`'"]/i,
    weight: 0.45,
    contextWeight: 0.85,
    responseCheck: (match, response) => {
      const forbidden = match[1];
      const lowerResponse = (response.response + ' ' + response.codeWritten).toLowerCase();
      return lowerResponse.includes(forbidden.toLowerCase());
    },
  },
  // "change X to Y" - specific replacement request
  {
    userPattern: /\bchange\s+[`'"]([\w\-_.]+)[`'"]\s+to\s+[`'"]([\w\-_.]+)[`'"]/i,
    weight: 0.5,
    contextWeight: 0.85,
    responseCheck: (match, response) => {
      const original = match[1];
      const lowerResponse = (response.response + ' ' + response.codeWritten).toLowerCase();
      return lowerResponse.includes(original.toLowerCase());
    },
  },
];

/**
 * Load the last response from Claude (captured by Stop hook)
 * @returns {LastResponse | null} - Last response or null if stale/missing
 */
function loadLastResponse() {
  if (!fs.existsSync(LAST_RESPONSE_FILE)) {
    return null;
  }

  try {
    /** @type {LastResponse} */
    const data = JSON.parse(fs.readFileSync(LAST_RESPONSE_FILE, 'utf8'));

    // Validate timestamp (must be < 5 minutes old)
    const timestamp = new Date(data.timestamp).getTime();
    const now = Date.now();

    if (now - timestamp > CONTEXT_STALENESS_MS) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

/**
 * Apply context-aware signal detection
 * @param {string} message - User's message
 * @param {LastResponse} lastResponse - Claude's last response
 * @returns {{ weight: number, contextWeight: number, validated: boolean }[]} - Matched signals
 */
function matchContextAwareSignals(message, lastResponse) {
  const matches = [];

  for (const signal of contextAwareSignals) {
    const match = message.match(signal.userPattern);
    if (match) {
      let validated = true;

      // If signal has a responseCheck, validate against context
      if (signal.responseCheck) {
        validated = signal.responseCheck(match, lastResponse);
      }

      matches.push({
        weight: signal.weight,
        contextWeight: signal.contextWeight,
        validated,
      });
    }
  }

  return matches;
}

/**
 * Check if user references identifiers from Claude's code
 * @param {string} message - User's message
 * @param {LastResponse} lastResponse - Claude's last response
 * @returns {number} - Boost multiplier (1.0-1.2)
 */
function getIdentifierReferenceBoost(message, lastResponse) {
  if (!lastResponse.codeWritten) return 1.0;

  // Extract identifiers from Claude's code (function names, variable names, etc.)
  const identifierPattern = /\b([a-zA-Z_][a-zA-Z0-9_]{2,})\b/g;
  const codeIdentifiers = new Set();
  let match;

  while ((match = identifierPattern.exec(lastResponse.codeWritten)) !== null) {
    // Skip common keywords
    const keywords = ['const', 'let', 'var', 'function', 'return', 'import', 'export', 'from', 'class', 'this', 'new', 'true', 'false', 'null', 'undefined'];
    if (!keywords.includes(match[1].toLowerCase())) {
      codeIdentifiers.add(match[1]);
    }
  }

  // Check if user mentions any of these identifiers
  const userIdentifiers = message.match(/[`'"]([\w\-_.]+)[`'"]/g) || [];
  for (const userIdent of userIdentifiers) {
    const cleaned = userIdent.replace(/[`'"]/g, '');
    if (codeIdentifiers.has(cleaned)) {
      return 1.15; // Boost if user references Claude's code
    }
  }

  return 1.0;
}

/**
 * Extract what Claude did wrong from context
 * @param {string} message - User's message
 * @param {LastResponse} lastResponse - Claude's last response
 * @returns {string | undefined} - Bad example or undefined
 */
function extractBadExample(message, lastResponse) {
  // Pattern: "use X instead of Y" - Y is the bad example
  let match = message.match(/\buse\s+[`'"]([\w\-_.]+)[`'"]\s+instead\s+of\s+[`'"]([\w\-_.]+)[`'"]/i);
  if (match) {
    return match[2]; // Return what to avoid
  }

  // Pattern: "instead of X" - X is the bad example
  match = message.match(/\binstead\s+of\s+[`'"]([\w\-_.]+)[`'"]/i);
  if (match) {
    return match[1];
  }

  // Pattern: "don't use X" - X is the bad example
  match = message.match(/\bdon'?t\s+use\s+[`'"]([\w\-_.]+)[`'"]/i);
  if (match) {
    return match[1];
  }

  // Pattern: "change X to Y" - X is the bad example
  match = message.match(/\bchange\s+[`'"]([\w\-_.]+)[`'"]\s+to/i);
  if (match) {
    return match[1];
  }

  // If user says "that's wrong" and Claude used a specific tool, mention it
  if (/\bthat'?s\s+(wrong|incorrect|not\s+right)/i.test(message)) {
    if (lastResponse.toolsUsed.includes('Edit') || lastResponse.toolsUsed.includes('Write')) {
      // Try to find a specific pattern in the code
      const codeSnippet = lastResponse.codeWritten.slice(0, 100);
      if (codeSnippet) {
        return codeSnippet.split('\n')[0]; // First line of code
      }
    }
  }

  return undefined;
}

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
 * @param {LastResponse | null} lastResponse - Optional context from Claude's last response
 * @returns {DetectionResult}
 */
function analyzeMessage(message, lastResponse = null) {
  const result = {
    isCorrection: false,
    confidence: 0,
    categoryHints: /** @type {PatternCategory[]} */ ([]),
    skipLearning: false,
    badExample: undefined,
    hasContext: lastResponse !== null,
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

  // Calculate weighted confidence score from basic signals
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

  // Apply context-aware signals if we have context
  let contextBoost = 0;
  if (lastResponse) {
    const contextMatches = matchContextAwareSignals(message, lastResponse);

    for (const match of contextMatches) {
      if (match.validated) {
        // Use contextWeight when validation passes
        const effectiveWeight = match.contextWeight;
        totalWeight += effectiveWeight;
        maxWeight = Math.max(maxWeight, effectiveWeight);
        contextBoost += (match.contextWeight - match.weight);
      } else {
        // Use base weight when validation fails
        totalWeight += match.weight;
        maxWeight = Math.max(maxWeight, match.weight);
      }
    }

    // Additional boost if user references identifiers from Claude's code
    const identifierBoost = getIdentifierReferenceBoost(message, lastResponse);
    if (identifierBoost > 1.0) {
      contextBoost += 0.1;
    }

    // Extract bad example from context
    result.badExample = extractBadExample(message, lastResponse);
  }

  // Use max weight as base, add bonus for multiple signals (capped)
  const multiSignalBonus = Math.min((totalWeight - maxWeight) * 0.3, 0.2);
  let confidence = maxWeight + multiSignalBonus;
  confidence *= getCodeBoost(message);

  // Apply context boost (capped)
  confidence += Math.min(contextBoost, 0.25);
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
 * @param {LastResponse | null} lastResponse
 * @returns {string}
 */
function generateInstruction(detection, existingPatterns, lastResponse = null) {
  const confidenceLabel = detection.confidence >= 0.8 ? 'HIGH'
    : detection.confidence >= 0.6 ? 'MEDIUM' : 'LOW';

  const categoryHint = detection.categoryHints.length > 0
    ? `Likely category: ${detection.categoryHints.join(' or ')}`
    : '';

  // Build context section if available
  let contextSection = '';
  if (detection.hasContext && lastResponse) {
    const contextParts = [];

    if (detection.badExample) {
      contextParts.push(`What to avoid: \`${detection.badExample}\``);
    }

    if (lastResponse.toolsUsed.length > 0) {
      contextParts.push(`Tools used: ${lastResponse.toolsUsed.join(', ')}`);
    }

    if (lastResponse.filesModified.length > 0) {
      const files = lastResponse.filesModified.slice(0, 3).map(f => path.basename(f));
      contextParts.push(`Files modified: ${files.join(', ')}`);
    }

    if (contextParts.length > 0) {
      contextSection = `\n    Context from previous response:\n    ${contextParts.join('\n    ')}`;
    }
  }

  return `<pattern-learning-hook>
    CORRECTION DETECTED (${confidenceLabel} confidence${detection.hasContext ? ', context-aware' : ''})
    ${contextSection}

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
    Format: {id: "pat_[timestamp]_[random]", name: "kebab-case", description, category, bad_example${detection.badExample ? ` (use: "${detection.badExample}")` : ''}, good_example, confidence: ${detection.confidence.toFixed(2)}, createdAt: ISO, hitCount: 0}

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

  // Load context from last response (may be null if stale or missing)
  const lastResponse = loadLastResponse();

  // Analyze the message with context
  const detection = analyzeMessage(message, lastResponse);

  // Exit early if not a correction or user wants to skip learning
  if (!detection.isCorrection || detection.skipLearning) {
    process.exit(0);
  }

  // Only load patterns file if we're actually going to inject
  const existingPatterns = getExistingPatternNames();

  // Output instruction for Claude
  console.log(JSON.stringify({
    context: generateInstruction(detection, existingPatterns, lastResponse),
    continue: true
  }));
}

main();
