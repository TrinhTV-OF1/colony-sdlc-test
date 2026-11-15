# autotest pack

Colony-native rewrite of `tm_test` (AI-kit): run every unresolved item of a viewpoint's
test-case checklist, one viewpoint per governed child run, with an independent review
before each child closes. Checklists are B6 format (`@colony/workflows/checklist`).

**SKELETON (WP-12 W1, 2026-10-27) — wired but not run.** `ts-d` (designing test cases) is
out of scope: this pack only reads a checklist someone else already authored (QD-14/QD-15).
`verify` needs real access to the product under test (browser/API) to do its job, and the
sysadmin has paused test execution for this effort — nothing here has been run against a
real checklist.

## Workflows

- **`run/colony-autotest.yaml`** — entry point. Reads a viewpoint catalog checklist
  (`inputs.viewpoint_catalog_path`), fans out one governed child run per viewpoint
  (`workflow:`+`fan_out:` — a real `workflow_runs` row each, not an inlined sub-DAG),
  summarizes the children's verdicts.
- **`viewpoint/colony-autotest-viewpoint.yaml`** — one child run per viewpoint. A
  `loop_group` processes its checklist one item at a time (pick → verify → record) until
  none remain `todo`, then an independently-modeled agent reviews the full result set.

## Script / agent boundary

Scripts (`runtime: bun`, calling `@colony/workflows/checklist`) own every read and write of
a checklist file — the pack's single writer for that resource (RULE-12). No agent node
edits a checklist directly. Agents own judgment only: did the product do what one item
describes (`verify`), and is the recorded result set trustworthy (`review`, a DIFFERENT
model from `verify` — tm_test's `ts-r`/diff-session-model gate, expressed here as two
nodes pinning two different `model:` values).

## Input shape

- `colony-autotest`: `viewpoint_catalog_path` — a checklist where each item is one
  viewpoint, `id` plus a `checklist` comment field (not one of B6's five known fields —
  B6 round-trips any field it does not recognize, so this pack can define its own without
  touching B6).
- `colony-autotest-viewpoint`: `viewpoint` — the whole fan-out item (`{ id, checklistPath }`),
  delivered automatically by `fan_out.as: viewpoint`, never set by the parent's own `with:`.

## Verified so far

- `colony validate workflows colony-autotest` / `colony-autotest-viewpoint`: both load and
  pass structural validation (node graph, `output_format` schemas, `until_bash` shell-quoting
  rules). The only remaining reported errors are "No default provider" on the two agent
  nodes — confirmed environment-only by running the same check against the pre-existing
  `colony-intake` workflow, which reports the identical error on its own agent nodes; this
  sandbox has no `defaultAssistant` configured, not a problem in this pack's YAML.
- Code review only for the six scripts (`.shared/io.ts`'s contract, `@colony/workflows/checklist`'s
  actual exported signatures) — no `tsc` project covers `.colony/workflows/**/scripts/*.ts`
  in this repo (confirmed: no tsconfig references that path), and neither `bun run` nor any
  workflow here has been executed for real.

## Known gaps (verification debt, not yet addressed)

- `record-result.ts`'s optimistic-lock conflict (`ChecklistStaleError`) is not retried — a
  real implementation needs a re-read-and-retry loop; this skeleton lets the node fail.
- `evidence`/`bug` here only ever set a value or leave it alone; `writeChecklistItemStatus`'s
  explicit-clear (`null`) path is never driven from this pack's YAML (no clear-value use
  case exists yet).
- `loop_group.max_iterations: 50` is a guess, not sized against any real checklist.
- No end-to-end run, so the exact `$INPUTS.<name>.<field>` nested-path substitution (used
  for `$INPUTS.viewpoint.checklistPath`) is confirmed only by pattern-matching how
  `$node.output.a.b` resolves elsewhere, and by `colony validate` accepting it structurally
  — not by a real run actually resolving it at the engine's substitution layer.
