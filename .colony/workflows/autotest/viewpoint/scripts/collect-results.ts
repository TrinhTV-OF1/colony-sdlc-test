/**
 * Child-workflow step after the loop_group finishes: read the viewpoint's
 * checklist one more time and hand the full item list to the independent
 * review agent as structured input, rather than asking that agent to go find
 * and parse the file itself — reading the checklist stays this pack's one
 * deterministic job (RULE-12 single-writer/single-reader-of-record), the
 * agent's job is judging what the read items mean.
 */
import { readChecklist, type ChecklistItem } from '@colony/workflows/checklist';
import { emit, refuse, trimmed } from '../../.shared/io';

async function main(): Promise<void> {
  const checklistPath = trimmed(process.env.INPUTS_CHECKLIST_PATH);
  if (checklistPath === '') throw new Error('checklist_path is required');

  const { items } = await readChecklist(checklistPath, process.cwd());
  const unresolved = items.filter((item: ChecklistItem) => item.status === 'todo' || item.status === 'doing');

  emit({ items, unresolvedCount: unresolved.length });
}

main().catch((err: unknown) => {
  refuse(`collect-results: ${err instanceof Error ? err.message : String(err)}`);
});
