import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Read-only successor to the inherited handoff notice. Never synchronize config,
// write to the legacy archive, launch another agent, or run Git mutations.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const locations = [
  join(root, '.codex', 'handoffs'),
  join(homedir(), '.claude', 'handoffs', 'c-dev-assemblio'),
];
const handoffs = locations.flatMap((directory) => {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => ({ name: entry.name, path: join(directory, entry.name) }));
});
handoffs.sort((a, b) => a.name.localeCompare(b.name));
const latest = handoffs.at(-1);
const context = [
  'Read AGENTS.md and docs/agent-history.md before resuming project work.',
  latest ? `A historical handoff is available at ${latest.path}. Read it when relevant; current instructions take precedence.` : '',
  'Preserve all Claude originals and existing user edits. Do not run Claude config synchronization or push automatically.',
].filter(Boolean).join('\n');
process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context },
}) + '\n');
