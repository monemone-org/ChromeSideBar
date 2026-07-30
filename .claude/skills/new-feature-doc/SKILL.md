---
name: new-feature-doc
description: Create a new feature spec doc in docs/features/ with the correct sequential ID and required YAML frontmatter. Use when starting a new feature spec for this project.
---

# New Feature Doc

`docs/features/next-id.txt` tracks the next available feature ID number. When creating a new feature doc, use the ID from this file as the doc's number prefix (e.g., `026-my-feature.md`), then increment the value in `next-id.txt`.

All feature docs in `docs/features/` must have YAML front matter:

```yaml
---
created: YYYY-MM-DD
after-version: X.X.XXX
status: draft | in-progress | completed | finalized | aborted
---
```

- `created`: Date file was first committed
- `after-version`: Extension version at time of creation (feature built after this version)
- `status`: Feature status
