# Assemblio Planning

## Status
Phase: Discovery
Primary Goal: Establish stable CLI architecture + first generator

---

# 1. MVP Scope

Assemblio CLI must:

- Accept a project config file
- Validate input
- Generate deterministic outputs
- Produce manifest of generated files

Non-goals:
- UI
- Cloud sync
- Multi-tenant architecture

---

# 2. First CLI Command

Command:

assemblio generate --config project.json

Expected behavior:
- Validate schema
- Run generators
- Output files into /output
- Write manifest.json
- Exit with code 0 on success

---

# 3. Core Components

1. Config loader
2. Schema validator
3. Generator engine
4. Output writer
5. Manifest builder

---

# 4. Milestones

## Milestone 1 – CLI Foundation
- Argument parsing
- Help system
- Config loading
- Error handling

## Milestone 2 – Generator Engine
- Template loader
- Deterministic render
- Snapshot test harness

## Milestone 3 – First Generator
- Basic project scaffold
- Sample template pack

---

# 5. Open Questions

1. Language choice?
2. Package manager?
3. Output format standard?
4. Template engine type?
5. Should plugins be first-class?

---

# 6. Risks

- Generator sprawl
- Non-deterministic outputs
- Overengineering too early

Focus: simplicity.