---
name: pattern-aware
description: Consults learned user patterns before writing or modifying code to ensure consistency with user preferences
---

# Pattern-Aware Coding

Before writing or modifying code, consult the user's learned patterns to ensure consistency.

## When to Activate

This skill activates when:
- Writing new code files
- Modifying existing code
- Suggesting refactors
- Code review tasks
- Answering "how should I..." coding questions

## Process

1. **Check for patterns file**: Read `.claude/correct-habits/patterns.json` (in the current project directory)

2. **Identify relevant patterns**: Based on the current task, find patterns that apply:
   - If writing a function → check naming, error-handling, style patterns
   - If setting up imports → check imports patterns  
   - If designing structure → check architecture patterns
   - If writing tests → check testing patterns

3. **Apply patterns proactively**: Don't wait to be corrected. If a pattern exists, follow it from the start.

4. **Mention when applying**: Briefly note when you're following a learned pattern:
   > "Using early returns per your preference..."
   > "Following your camelCase naming convention..."

5. **Update hit count**: After successfully applying a pattern, increment its `hitCount` in the JSON file to help prioritize frequently-used patterns.

## Pattern Categories Reference

- **naming**: Variable, function, file, class naming conventions
- **error-handling**: Try/catch style, error propagation, logging
- **architecture**: File organization, module structure, design patterns
- **testing**: Test structure, naming, mocking approaches
- **style**: Formatting, comments, code organization within files
- **imports**: Import ordering, default vs named, path aliases
- **other**: Anything else

## Important

- Patterns from this file take precedence over general best practices
- If a pattern conflicts with project-specific rules in CLAUDE.md, CLAUDE.md wins
- If unsure whether a pattern applies, ask the user