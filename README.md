# Correct Habits

**A Claude Code plugin that learns from your corrections and remembers your coding preferences.**

Claude makes mistakes. You correct them. But next session, it forgets. This plugin fixes that.

When you correct Claude's code ("no, we use early returns here", "always use TypeScript interfaces"), the plugin detects the correction, extracts the underlying pattern, and injects it into every future session—so Claude gets it right the first time.

## Features

- **Automatic Learning** — Detects corrections in natural conversation and extracts reusable patterns
- **Smart Filtering** — Distinguishes between one-off fixes and patterns worth remembering
- **Session Injection** — Loads your patterns at startup so Claude follows them immediately
- **Per-Project Storage** — Each project maintains its own pattern library
- **Full Control** — View, search, export, and remove patterns anytime

## Installation

```bash
/plugin install github:rkaushik29/claude-correct-habits
```

### Local Development

```bash
git clone https://github.com/rkaushik29/claude-correct-habits ~/.claude/plugins/correct-habits
claude --plugin-dir ~/.claude/plugins/correct-habits
```

### Requirements

- Claude Code v2.0.12 or later
- `ANTHROPIC_API_KEY` environment variable

## Usage

Just use Claude normally. When you make a correction, the plugin handles the rest.

### Correction Examples

| You say | Plugin learns |
|---------|---------------|
| "No, we always use early returns" | `prefer-early-returns` pattern |
| "That's wrong—use `interface`, not `type`" | `prefer-interfaces` pattern |
| "Our convention is kebab-case for files" | `kebab-case-files` pattern |

### Commands

| Command | Description |
|---------|-------------|
| `/patterns` | List all learned patterns |
| `/patterns search <query>` | Find patterns by keyword |
| `/patterns remove <name>` | Delete a specific pattern |
| `/patterns export` | Export as markdown for CLAUDE.md |
| `/add-pattern` | Manually add a new pattern |

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│  1. You correct Claude                                          │
│     "No, we always use async/await, never .then()"              │
├─────────────────────────────────────────────────────────────────┤
│  2. Plugin detects correction signals                           │
│     Keywords: "no", "always", "never", "wrong", "prefer"        │
├─────────────────────────────────────────────────────────────────┤
│  3. Claude analyzes if it's a reusable pattern                  │
│     ✓ Reusable: coding style, naming conventions                │
│     ✗ One-off: specific bug fixes, typos                        │
├─────────────────────────────────────────────────────────────────┤
│  4. Pattern saved with examples                                 │
│     Bad:  fetch().then(data => ...)                             │
│     Good: const data = await fetch()                            │
├─────────────────────────────────────────────────────────────────┤
│  5. Next session: pattern loaded automatically                  │
│     Claude follows your preference from the start               │
└─────────────────────────────────────────────────────────────────┘
```

## Pattern Categories

| Category | Examples |
|----------|----------|
| `naming` | Variable casing, function prefixes, file naming |
| `style` | Formatting, early returns, code organization |
| `error-handling` | Try/catch patterns, error propagation |
| `architecture` | File structure, design patterns, module organization |
| `testing` | Test structure, mocking strategies, assertions |
| `imports` | Import ordering, path aliases, barrel files |

## Data Storage

Patterns are stored locally at `.claude/correct-habits/patterns.json` in each project:

```json
{
  "patterns": [
    {
      "id": "pat_1706540400000_x7k2m9",
      "name": "prefer-early-returns",
      "description": "Use early returns instead of nested conditionals",
      "category": "style",
      "bad_example": "if (x) { if (y) { doThing() } }",
      "good_example": "if (!x) return;\nif (!y) return;\ndoThing();",
      "confidence": 0.92,
      "hitCount": 5,
      "createdAt": "2025-01-29T10:00:00.000Z"
    }
  ]
}
```

## Tips

- **Be explicit** — "We always use X because Y" produces better patterns than "use X"
- **Use `/add-pattern`** — For conventions you know upfront, add them manually
- **Export stable patterns** — Run `/patterns export` to add mature patterns to CLAUDE.md
- **Review periodically** — Use `/patterns` to audit what's been learned

## Privacy

- All data remains on your local machine
- Pattern analysis uses your Claude API quota
- No telemetry, tracking, or external data transmission

## License

MIT
