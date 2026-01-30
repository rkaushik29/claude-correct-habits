# Claude - Learn Bad Habits

A Claude Code plugin that automatically learns your coding patterns from corrections and enforces them in future sessions.

## How It Works

1. **Automatic Detection**: When you correct Claude ("no, we always use...", "that's wrong, prefer..."), the plugin detects it.
2. **Smart Analysis**: Uses Claude to determine if the correction is a reusable pattern (not just a one-off fix).
3. **Pattern Storage**: Extracts the rule with good/bad examples and stores it locally.
4. **Priority Injection**: Loads your patterns at session start so Claude follows them from the beginning.

## Installation

```bash
# Install directly from GitHub
/plugin install github:rkaushik29/claude-bad-habits
```

Or for local development:
```bash
# Clone to your plugins directory
git clone https://github.com/rkaushik29/claude-bad-habits ~/.claude/plugins/learn-bad-habits

# Test with plugin-dir flag
claude --plugin-dir ~/.claude/plugins/learn-bad-habits
```

## Requirements

- Claude Code v2.0.12+
- `ANTHROPIC_API_KEY` environment variable set (for pattern analysis)

## Commands

| Command | Description |
|---------|-------------|
| `/patterns` | List all learned patterns |
| `/patterns search <query>` | Search patterns by keyword |
| `/patterns remove <name>` | Remove a pattern |
| `/patterns export` | Export as markdown for CLAUDE.md |
| `/add-pattern <description>` | Manually add a pattern |

## Pattern Categories

- **naming** - Variable, function, file naming conventions
- **error-handling** - Try/catch style, error propagation
- **architecture** - File organization, design patterns
- **testing** - Test structure, mocking approaches
- **style** - Formatting, comments, code organization
- **imports** - Import ordering, path aliases
- **other** - Everything else

## Data Storage

Patterns are stored in `.claude/bad-habits/patterns.json` (per-project):

```json
{
  "patterns": [
    {
      "id": "pat_1234_abc",
      "name": "prefer-early-returns",
      "description": "Use early returns instead of nested conditionals",
      "category": "style",
      "bad_example": "if (x) { if (y) { doThing() } }",
      "good_example": "if (!x) return; if (!y) return; doThing();",
      "confidence": 0.92,
      "hitCount": 5,
      "createdAt": "2025-01-29T..."
    }
  ]
}
```

## How Patterns Are Detected

The plugin looks for correction signals in your messages:
- "No, actually..." / "Don't do that..."
- "We always/never..." / "Our convention is..."
- "That's wrong, use..." / "Prefer X instead"
- "Fix this..." / "Should be..."

Then Claude analyzes whether it's a reusable pattern or just a one-time fix.

## Tips

- Be explicit when correcting: "We always use X because Y" helps capture better patterns
- Use `/add-pattern` for patterns you know upfront
- Run `/patterns export` periodically to add stable patterns to your CLAUDE.md
- Patterns with high `hitCount` are loaded first (most relevant)

## Privacy

- All data stays local on your machine
- Pattern analysis uses Claude API calls (billed to your account)
- No telemetry or external data sharing

## License

MIT