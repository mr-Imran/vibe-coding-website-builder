---
type: llm
focus: trace
weight: 1
---

Passwords are stored only as salted hashes (no plain-text password is stored in the database or written in any project file), and staff-only actions are refused on the server for a signed-in member (a test or a direct request shows a 403 or equivalent, not just a hidden button)
