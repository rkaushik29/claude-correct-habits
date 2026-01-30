#!/usr/bin/env node
/**
 * Correct Habits - Stop Hook
 * Captures Claude's response for context-aware correction detection
 */

const fs = require('fs');
const path = require('path');

/**
 * @typedef {Object} ToolUseInfo
 * @property {string} tool - Tool name (e.g., "Edit", "Write")
 * @property {string} [file] - File path if applicable
 * @property {string} [code] - Code snippet if applicable
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
 * @typedef {Object} TranscriptMessage
 * @property {string} type - Message type
 * @property {Object} message - Message content
 * @property {string} message.role - 'user' or 'assistant'
 * @property {Array<Object>} message.content - Content blocks
 */

/**
 * @typedef {Object} HookInput
 * @property {string} [session_id] - Session ID
 * @property {string} [transcript_path] - Path to the transcript JSONL file
 * @property {string} [stop_hook_active] - Whether stop hook is active
 */

const STATE_DIR = path.join(process.cwd(), '.claude', 'correct-habits');
const STATE_FILE = path.join(STATE_DIR, 'last-response.json');

/**
 * Ensure state directory exists
 */
function ensureStateDir() {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
}

/**
 * Read and parse the transcript JSONL file
 * @param {string} transcriptPath - Path to transcript file
 * @returns {TranscriptMessage[]} - Array of transcript messages
 */
function readTranscript(transcriptPath) {
  if (!fs.existsSync(transcriptPath)) {
    return [];
  }

  const content = fs.readFileSync(transcriptPath, 'utf8');
  const lines = content.trim().split('\n').filter(line => line.trim());

  return lines.map(line => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

/**
 * Find the last assistant message in the transcript
 * @param {TranscriptMessage[]} transcript - Parsed transcript
 * @returns {TranscriptMessage | null} - Last assistant message or null
 */
function findLastAssistantMessage(transcript) {
  for (let i = transcript.length - 1; i >= 0; i--) {
    const entry = transcript[i];
    if (entry?.message?.role === 'assistant') {
      return entry;
    }
  }
  return null;
}

/**
 * Extract text content from message content blocks
 * @param {Array<Object>} contentBlocks - Content blocks from message
 * @returns {string} - Extracted text
 */
function extractTextContent(contentBlocks) {
  if (!Array.isArray(contentBlocks)) return '';

  return contentBlocks
    .filter(block => block.type === 'text')
    .map(block => block.text || '')
    .join('\n')
    .trim();
}

/**
 * Extract tool usage information from content blocks
 * @param {Array<Object>} contentBlocks - Content blocks from message
 * @returns {ToolUseInfo[]} - Array of tool use info
 */
function extractToolUse(contentBlocks) {
  if (!Array.isArray(contentBlocks)) return [];

  /** @type {ToolUseInfo[]} */
  const tools = [];

  for (const block of contentBlocks) {
    if (block.type === 'tool_use') {
      const toolInfo = {
        tool: block.name || 'unknown',
      };

      const input = block.input || {};

      // Extract file path for file-related tools
      if (input.file_path) {
        toolInfo.file = input.file_path;
      } else if (input.path) {
        toolInfo.file = input.path;
      }

      // Extract code content for Edit/Write tools
      if (block.name === 'Edit') {
        if (input.new_string) {
          toolInfo.code = input.new_string;
        }
      } else if (block.name === 'Write') {
        if (input.content) {
          toolInfo.code = input.content;
        }
      }

      tools.push(toolInfo);
    }
  }

  return tools;
}

/**
 * Build the last response state object
 * @param {string} sessionId - Session ID
 * @param {TranscriptMessage} assistantMessage - Last assistant message
 * @returns {LastResponse} - State object to save
 */
function buildLastResponse(sessionId, assistantMessage) {
  const contentBlocks = assistantMessage?.message?.content || [];
  const textContent = extractTextContent(contentBlocks);
  const toolUseInfo = extractToolUse(contentBlocks);

  const toolsUsed = [...new Set(toolUseInfo.map(t => t.tool))];
  const filesModified = [...new Set(toolUseInfo.filter(t => t.file).map(t => t.file))];
  const codeSnippets = toolUseInfo
    .filter(t => t.code)
    .map(t => t.code)
    .join('\n---\n');

  return {
    sessionId,
    response: textContent,
    toolsUsed,
    filesModified,
    codeWritten: codeSnippets,
    timestamp: new Date().toISOString(),
  };
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

  const transcriptPath = hookInput.transcript_path;
  const sessionId = hookInput.session_id || 'unknown';

  if (!transcriptPath) {
    process.exit(0);
  }

  // Read and parse transcript
  const transcript = readTranscript(transcriptPath);

  if (transcript.length === 0) {
    process.exit(0);
  }

  // Find last assistant message
  const lastAssistant = findLastAssistantMessage(transcript);

  if (!lastAssistant) {
    process.exit(0);
  }

  // Build and save state
  ensureStateDir();
  const lastResponse = buildLastResponse(sessionId, lastAssistant);

  fs.writeFileSync(STATE_FILE, JSON.stringify(lastResponse, null, 2));

  // Stop hook doesn't need to output anything
  process.exit(0);
}

main();
