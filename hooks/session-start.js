#!/usr/bin/env node
/**
 * Correct Habits - Session Start Hook
 * Injects learned patterns as high-priority context and handles pending examples
 */

const fs = require('fs');
const path = require('path');

/**
 * @typedef {'naming' | 'error-handling' | 'architecture' | 'testing' | 'style' | 'imports' | 'other'} PatternCategory
 */

/**
 * @typedef {Object} Pattern
 * @property {string} id - Unique identifier (e.g., "pat_1234567890_abc123")
 * @property {string} name - Kebab-case name (e.g., "prefer-early-returns")
 * @property {string} description - Clear, actionable description of the pattern
 * @property {PatternCategory} category - Pattern category for grouping
 * @property {string} [bad_example] - Code example showing what NOT to do
 * @property {string} [good_example] - Code example showing the preferred approach
 * @property {number} confidence - Confidence score 0-1
 * @property {string} [reasoning] - Why this pattern was learned
 * @property {string} createdAt - ISO date string
 * @property {number} hitCount - Number of times this pattern was applied
 */

/**
 * @typedef {Object} PatternsData
 * @property {Pattern[]} patterns - Array of learned patterns
 * @property {number} version - Schema version
 */

/**
 * @typedef {Object} PendingPattern
 * @property {string} name - Pattern name
 * @property {string} description - Pattern description
 * @property {string} [bad_example] - Known bad example
 */

/**
 * @typedef {Object} HookOutput
 * @property {string} context - Context to inject into the conversation
 * @property {boolean} continue - Whether to continue processing
 */

const PATTERNS_FILE = path.join(process.cwd(), '.claude', 'correct-habits', 'patterns.json');
const PENDING_FILE = path.join(process.cwd(), '.claude', 'correct-habits', 'pending.json');
const LAST_RESPONSE_FILE = path.join(process.cwd(), '.claude', 'correct-habits', 'last-response.json');

const STATE_STALENESS_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Load patterns from the patterns file
 * @returns {PatternsData}
 */
function loadPatterns() {
  if (fs.existsSync(PATTERNS_FILE)) {
    return JSON.parse(fs.readFileSync(PATTERNS_FILE, 'utf8'));
  }
  return { patterns: [], version: 1 };
}

/**
 * Load pending patterns that need examples
 * @returns {PendingPattern[]}
 */
function loadPending() {
  if (fs.existsSync(PENDING_FILE)) {
    return JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
  }
  return [];
}

/**
 * Clean up stale state files from previous sessions
 * Removes last-response.json if it's older than 30 minutes
 */
function cleanupStaleState() {
  if (!fs.existsSync(LAST_RESPONSE_FILE)) {
    return;
  }

  try {
    const data = JSON.parse(fs.readFileSync(LAST_RESPONSE_FILE, 'utf8'));
    const timestamp = new Date(data.timestamp).getTime();
    const now = Date.now();

    if (now - timestamp > STATE_STALENESS_MS) {
      fs.unlinkSync(LAST_RESPONSE_FILE);
    }
  } catch {
    // If file is corrupted or unreadable, remove it
    try {
      fs.unlinkSync(LAST_RESPONSE_FILE);
    } catch {
      // Ignore deletion errors
    }
  }
}

/**
 * Format patterns as markdown for context injection
 * @param {Pattern[]} patterns - Patterns to format
 * @returns {string} Formatted markdown string
 */
function formatPatternsForContext(patterns) {
  if (patterns.length === 0) return '';

  // Group by category
  /** @type {Record<string, Pattern[]>} */
  const byCategory = patterns.reduce((acc, p) => {
    const cat = p.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, /** @type {Record<string, Pattern[]>} */ ({}));

  let output = `\n<learned_patterns priority="high">
# User's Coding Patterns & Preferences
These patterns were learned from previous corrections. Follow them strictly.

`;

  for (const [category, categoryPatterns] of Object.entries(byCategory)) {
    output += `## ${category.charAt(0).toUpperCase() + category.slice(1)}\n\n`;
    
    for (const p of categoryPatterns) {
      output += `### ${p.name}\n`;
      output += `${p.description}\n\n`;
      
      if (p.bad_example) {
        output += `❌ Don't:\n\`\`\`\n${p.bad_example}\n\`\`\`\n\n`;
      }
      if (p.good_example) {
        output += `✓ Do:\n\`\`\`\n${p.good_example}\n\`\`\`\n\n`;
      }
    }
  }

  output += `</learned_patterns>\n`;
  return output;
}

/**
 * Format pending patterns as a prompt asking for examples
 * @param {PendingPattern[]} pending - Pending patterns needing examples
 * @returns {string} Formatted prompt string
 */
function formatPendingPrompt(pending) {
  if (pending.length === 0) return '';

  let output = `\n<pattern_examples_needed>
I learned some patterns from your corrections but need examples to apply them correctly.
Please provide a quick code example for each:

`;

  pending.forEach((p, i) => {
    output += `${i + 1}. **${p.name}**: ${p.description}\n`;
    if (p.bad_example) {
      output += `   What NOT to do: \`${p.bad_example}\`\n`;
    }
    output += `   → What's the correct way?\n\n`;
  });

  output += `Reply with examples or say "skip" to dismiss.
</pattern_examples_needed>\n`;

  return output;
}

/**
 * Main entry point - loads patterns and outputs context for injection
 * @returns {void}
 */
function main() {
  // Clean up stale state from previous sessions
  cleanupStaleState();

  const patternsData = loadPatterns();
  const pending = loadPending();
  
  // Sort patterns by hit count and recency
  const sortedPatterns = patternsData.patterns.sort((a, b) => {
    const scoreA = (a.hitCount || 0) * 2 + (new Date(a.createdAt) > Date.now() - 7 * 24 * 60 * 60 * 1000 ? 1 : 0);
    const scoreB = (b.hitCount || 0) * 2 + (new Date(b.createdAt) > Date.now() - 7 * 24 * 60 * 60 * 1000 ? 1 : 0);
    return scoreB - scoreA;
  });

  // Limit to top 20 patterns to avoid context bloat
  const topPatterns = sortedPatterns.slice(0, 20);
  
  const contextInjection = formatPatternsForContext(topPatterns);
  const pendingPrompt = formatPendingPrompt(pending);

  // Output for Claude Code to inject
  const hookOutput = {
    context: contextInjection + pendingPrompt,
    continue: true
  };

  console.log(JSON.stringify(hookOutput));
}

main();