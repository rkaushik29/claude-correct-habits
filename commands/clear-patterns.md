---
name: clear-patterns
description: Clear all or specific learned coding patterns from memory
arguments: pattern name or "all" (optional)
---

# Correct Habits - Clear Patterns

You are helping the user clear learned coding patterns from the Correct Habits memory.

## Process

1. Read the current patterns from `.claude/correct-habits/patterns.json` (in the current project directory)

2. If the file doesn't exist or is empty, inform the user: "No patterns stored yet."

3. If `$ARGUMENTS` is provided:
   - If "all": Confirm before clearing all patterns
   - Otherwise: Search for patterns matching the argument (by name or description)

4. If no arguments, list all patterns and ask which to clear:
   ```
   Current patterns:
   1. [name]: [description]
   2. [name]: [description]
   ...

   Enter a number, pattern name, or "all" to clear:
   ```

5. Before clearing, always confirm:
   ```
   Are you sure you want to clear [pattern name / all X patterns]? (yes/no)
   ```

6. If confirmed:
   - For single pattern: Remove from the patterns array
   - For "all": Reset to `{"patterns": [], "version": 1}`

7. Write the updated JSON back to the file

## Example Interactions

### Clear all patterns
User: `/clear-patterns all`

You:
```
You have 5 learned patterns. Are you sure you want to clear all of them? (yes/no)
```

User: `yes`

You:
```
Cleared all 5 patterns. Starting fresh!
```

### Clear specific pattern
User: `/clear-patterns prefer-const`

You:
```
Found pattern: **prefer-const-over-let**
"Use const by default, only use let when reassignment is needed"

Clear this pattern? (yes/no)
```

### List and select
User: `/clear-patterns`

You:
```
Current patterns:
1. prefer-const-over-let: Use const by default
2. prefer-early-returns: Use early returns to reduce nesting
3. no-any-types: Avoid using 'any' type in TypeScript

Enter a number, pattern name, or "all" to clear:
```
