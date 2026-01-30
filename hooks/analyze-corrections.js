#!/usr/bin/env node
/**
 * Pattern Guardian - Correction Analyzer Hook
 * Runs on session stop to analyze user corrections and extract patterns
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const PATTERNS_FILE = path.join(process.env.HOME, '.claude', 'pattern-guardian', 'patterns.json');
const PENDING_FILE = path.join(process.env.HOME, '.claude', 'pattern-guardian', 'pending.json');

// Ensure directories exist
function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Load existing patterns
function loadPatterns() {
  ensureDir(PATTERNS_FILE);
  if (fs.existsSync(PATTERNS_FILE)) {
    return JSON.parse(fs.readFileSync(PATTERNS_FILE, 'utf8'));
  }
  return { patterns: [], version: 1 };
}

// Save patterns
function savePatterns(data) {
  ensureDir(PATTERNS_FILE);
  fs.writeFileSync(PATTERNS_FILE, JSON.stringify(data, null, 2));
}

// Call Claude API to analyze correction
async function analyzeCorrection(context) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[pattern-guardian] ANTHROPIC_API_KEY not set');
    return null;
  }

  const prompt = `Analyze this conversation excerpt where a user corrected an AI coding assistant.

<conversation>
${context}
</conversation>

Determine if this correction reveals a CODING PATTERN or PREFERENCE (not just a one-off syntactic fix).

Pattern examples: naming conventions, error handling style, preferred libraries, architectural preferences, testing approaches, code organization rules.

NOT patterns: typo fixes, one-time bug fixes, project-specific implementation details.

Respond in JSON only:
{
  "is_pattern": boolean,
  "confidence": 0-1,
  "pattern": {
    "name": "short-kebab-case-name",
    "description": "Clear rule description",
    "category": "naming|error-handling|architecture|testing|style|imports|other",
    "bad_example": "code showing what NOT to do (from the correction)",
    "good_example": "code showing the correct approach",
    "needs_example": boolean // true if good_example couldn't be inferred
  },
  "reasoning": "why this is/isn't a reusable pattern"
}`;

  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    });

    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          const text = response.content?.[0]?.text || '';
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          resolve(jsonMatch ? JSON.parse(jsonMatch[0]) : null);
        } catch (e) {
          resolve(null);
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Detect correction patterns in messages
function detectCorrectionContext(hookInput) {
  const transcript = hookInput.transcript || [];
  const corrections = [];
  
  // Look for user messages that follow assistant actions and contain correction signals
  const correctionSignals = [
    /no,?\s*(actually|don't|shouldn't|never|always|instead|use|prefer)/i,
    /that's\s*(not|wrong)/i,
    /we\s*(don't|never|always|prefer)/i,
    /please\s*(don't|never|always|use)/i,
    /instead\s*(of|use)/i,
    /wrong\s*(approach|pattern|way)/i,
    /our\s*(convention|standard|pattern|style)/i,
    /should\s*(be|have|use)/i,
    /fix\s*(this|that|the)/i
  ];

  for (let i = 1; i < transcript.length; i++) {
    const msg = transcript[i];
    const prevMsg = transcript[i - 1];
    
    if (msg.role === 'user' && prevMsg.role === 'assistant') {
      const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      const isCorrection = correctionSignals.some(regex => regex.test(text));
      
      if (isCorrection) {
        // Get context window around the correction
        const contextStart = Math.max(0, i - 2);
        const contextEnd = Math.min(transcript.length, i + 2);
        const context = transcript.slice(contextStart, contextEnd)
          .map(m => `[${m.role}]: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
          .join('\n\n');
        
        corrections.push({ index: i, context, userMessage: text });
      }
    }
  }
  
  return corrections;
}

// Main hook handler
async function main() {
  let hookInput;
  try {
    hookInput = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
  } catch (e) {
    console.error('[pattern-guardian] Failed to parse hook input');
    process.exit(0);
  }

  const corrections = detectCorrectionContext(hookInput);
  if (corrections.length === 0) {
    process.exit(0);
  }

  console.log(`[pattern-guardian] Analyzing ${corrections.length} potential correction(s)...`);

  const patternsData = loadPatterns();
  const pending = [];

  for (const correction of corrections) {
    try {
      const analysis = await analyzeCorrection(correction.context);
      
      if (analysis?.is_pattern && analysis.confidence > 0.7) {
        const pattern = {
          id: `pat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          ...analysis.pattern,
          confidence: analysis.confidence,
          reasoning: analysis.reasoning,
          createdAt: new Date().toISOString(),
          hitCount: 0
        };

        if (analysis.pattern.needs_example) {
          // Queue for user to provide example
          pending.push(pattern);
          console.log(`[pattern-guardian] Pattern "${pattern.name}" needs example - queued for next session`);
        } else {
          // Check for duplicates
          const isDupe = patternsData.patterns.some(p => 
            p.name === pattern.name || 
            p.description.toLowerCase() === pattern.description.toLowerCase()
          );
          
          if (!isDupe) {
            patternsData.patterns.push(pattern);
            console.log(`[pattern-guardian] ✓ Learned pattern: ${pattern.name}`);
          }
        }
      }
    } catch (e) {
      console.error(`[pattern-guardian] Analysis error: ${e.message}`);
    }
  }

  savePatterns(patternsData);
  
  if (pending.length > 0) {
    ensureDir(PENDING_FILE);
    const existingPending = fs.existsSync(PENDING_FILE) 
      ? JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8')) 
      : [];
    fs.writeFileSync(PENDING_FILE, JSON.stringify([...existingPending, ...pending], null, 2));
  }
}

main().catch(console.error);