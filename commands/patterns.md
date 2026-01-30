---
name: patterns
description: View, search, and manage your learned coding patterns
arguments: action (list|search|remove|export)
---

# Correct Habits - Pattern Management

You are helping the user manage their learned coding patterns stored by the Correct Habits plugin.

## Available Actions

Based on `$ARGUMENTS`:

### `list` (default)
Read the patterns file at `.claude/correct-habits/patterns.json` (in the current project directory) and display all patterns in a readable format:
- Group by category
- Show name, description, and examples
- Include hit count and when it was learned

### `search <query>`
Search patterns by name, description, or category. Show matching results.

### `remove <pattern-name-or-id>`
Remove a pattern by its name or ID. Confirm with the user before deleting.

### `export`
Export all patterns as a markdown file that could be added to CLAUDE.md

## Instructions

1. Read the patterns file: `.claude/correct-habits/patterns.json`
2. Parse the JSON and perform the requested action
3. Format output clearly for the user
4. If the file doesn't exist, inform the user no patterns have been learned yet

## File Format Reference
```json
{
  "patterns": [
    {
      "id": "pat_xxx",
      "name": "pattern-name",
      "description": "What the pattern enforces",
      "category": "naming|error-handling|architecture|testing|style|imports|other",
      "bad_example": "code to avoid",
      "good_example": "preferred code",
      "confidence": 0.85,
      "hitCount": 5,
      "createdAt": "ISO date"
    }
  ]
}
```