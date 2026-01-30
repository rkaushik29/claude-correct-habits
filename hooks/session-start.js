#!/usr/bin/env node
/**
 * Correct Habits - Session Start Hook
 * Injects learned patterns as high-priority context and handles pending examples
 */

const fs = require('fs');
const path = require('path');

const PATTERNS_FILE = path.join(process.cwd(), '.claude', 'correct-habits', 'patterns.json');
const PENDING_FILE = path.join(process.cwd(), '.claude', 'correct-habits', 'pending.json');

function loadPatterns() {
  if (fs.existsSync(PATTERNS_FILE)) {
    return JSON.parse(fs.readFileSync(PATTERNS_FILE, 'utf8'));
  }
  return { patterns: [], version: 1 };
}

function loadPending() {
  if (fs.existsSync(PENDING_FILE)) {
    return JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
  }
  return [];
}

function formatPatternsForContext(patterns) {
  if (patterns.length === 0) return '';

  // Group by category
  const byCategory = patterns.reduce((acc, p) => {
    const cat = p.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});

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

function main() {
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