---
name: add-pattern  
description: Manually add a coding pattern or preference for Claude to remember
arguments: description of the pattern (optional)
---

# Correct Habits - Add Pattern

You are helping the user manually add a coding pattern to the Correct Habits memory.

## Process

1. If `$ARGUMENTS` is provided, use it as the starting point for the pattern description
2. If not, ask the user: "What coding pattern or preference would you like me to remember?"

3. Once you have the description, extract:
   - **name**: A short kebab-case identifier (e.g., `prefer-const-over-let`)
   - **description**: Clear, actionable rule
   - **category**: One of: naming, error-handling, architecture, testing, style, imports, other
   - **bad_example**: Code showing what NOT to do (ask if not obvious)
   - **good_example**: Code showing the correct approach (ask if not provided)

4. Confirm with the user before saving:
   ```
   I'll remember this pattern:
   
   **[name]**: [description]
   
   ❌ Don't: [bad_example]
   ✓ Do: [good_example]
   
   Save this pattern? (yes/no)
   ```

5. If confirmed, append to `.claude/correct-habits/patterns.json` (in the current project directory):

```javascript
const pattern = {
  id: `pat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  name: "[extracted name]",
  description: "[extracted description]",
  category: "[category]",
  bad_example: "[bad example]",
  good_example: "[good example]",
  confidence: 1.0, // Manual additions are high confidence
  reasoning: "Manually added by user",
  createdAt: new Date().toISOString(),
  hitCount: 0
};
```

6. Create the directory if it doesn't exist: `mkdir -p .claude/correct-habits`

7. Read existing file, parse JSON, push new pattern, write back

## Example Interaction

User: `/add-pattern always use early returns instead of nested if statements`

You:
```
I'll remember this pattern:

**prefer-early-returns**: Use early returns to reduce nesting instead of wrapping code in if statements

❌ Don't:
function process(data) {
  if (data) {
    if (data.valid) {
      // lots of nested code
    }
  }
}

✓ Do:
function process(data) {
  if (!data) return;
  if (!data.valid) return;
  // flat code
}

Save this pattern? (yes/no)
```