---
author: kasper.simonsen@pac-technologies.com.au
author_source: git
agent: Codex
date: 2026-10-12
topic: Claude Code to Codex repository migration
references:
  - docs/codex-migration.md
  - docs/agent-history.md
  - AGENTS.md
---

## 2026-10-12 — Codex migration

- Did: inventoried project/user instructions, settings, plugins, MCP registrations and all matching
  history; migrated instructions, skill references, research agent/modules and a read-only handoff hook.
- Found: 128 relevant transcripts; 224 project permission rules; pre-existing partial Codex setup.
  Some protected Claude skill files resolve to Codex skill files through Windows links. Four source
  contents were accidentally changed, then restored to their exact baseline hashes; independent
  Codex skill variants now avoid rewriting those link targets. All 62 protected repo originals match.
- Changed: AGENTS.md, .codex/config.toml, .gitignore, adapted skills/agent modules, history/reference/
  migration docs and scripts/codex-session-start.mjs. Square ACCESS_TOKEN stored concealed in the
  existing project 1Password Environment; config now references its variable name and keeps sandbox/write guards.
- Verified: strict Codex app-server config load; 96 local skills detected with zero skill errors,
  including all source skill names and two independent variants; project hook detected; MCP registration
  listing; SessionStart script syntax/output. Existing Windows sandbox provisioning still fails doctor.
- Open: review/trust the hook; rotate the legacy Square token; complete Monday tracking after
  authentication (direct runtime-injection fallback timed out); repair Windows sandbox provisioning.
  Claude originals and unrelated user edits remain in place. Commit is local only; no push authorized.

The inherited work-log skill points to a missing format reference and `.claude/work/`, which this
migration explicitly forbids writing. This factual, attributed entry uses the documented Codex location.
No task code or commit SHA is invented in this record.
