<div align="center">

# Correct Habits

**Claude forgets. This plugin remembers.**

[![Claude Code](https://img.shields.io/badge/Claude_Code-Plugin-7c3aed)](https://docs.anthropic.com/en/docs/claude-code)
[![License](https://img.shields.io/badge/License-MIT-22c55e)](LICENSE)
[![Version](https://img.shields.io/badge/Version-1.0.0-3b82f6)](https://github.com/rkaushik29/claude-correct-habits)

<br />

*A Claude Code plugin that learns from your corrections and enforces your coding preferences—automatically.*

---

</div>

## The Problem

You correct Claude: *"No, we always use early returns here."*

Next session, Claude forgets. You correct it again. And again.

## The Solution

**Correct Habits** detects your corrections, extracts the pattern, and injects it into every future session.

```
You: "No, use async/await, never .then()"
         ↓
   Pattern saved
         ↓
Claude: Gets it right next time
```

---

## Quick Start

```bash
/plugin install github:rkaushik29/claude-correct-habits
```

> Requires Claude Code v2.0.12+ and `ANTHROPIC_API_KEY`

---

## Commands

| | |
|---|---|
| `/patterns` | View learned patterns |
| `/patterns search <query>` | Search by keyword |
| `/patterns export` | Export to markdown |
| `/add-pattern` | Add pattern manually |
| `/clear-patterns` | Remove patterns |

---

## How It Works

| Step | What Happens |
|:----:|--------------|
| **1** | You correct Claude → *"We never use `var`, always `const`"* |
| **2** | Plugin detects correction signals |
| **3** | Claude analyzes if it's a reusable pattern |
| **4** | Pattern saved to `.claude/correct-habits/patterns.json` |
| **5** | Next session → pattern loaded automatically |

---

## Privacy

All data stays local. Pattern analysis uses your API quota. No telemetry.

---

<div align="center">

**[MIT License](LICENSE)**

</div>
