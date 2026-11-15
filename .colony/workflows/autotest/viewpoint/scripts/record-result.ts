/**
 * Child-workflow loop_group body step (last node of each iteration): persist
 * `verify`'s verdict for the item `pick` named, through B6's optimistic lock.
 * Skipped by its own `when:` on the same iteration `pick` finds nothing left
 * — never runs with no item to record.
 *
 * `evidence`/`bug` here only ever SET a value or leave it untouched: an empty
 * `with:` binding reads as "not provided" (`.shared/io.ts`'s own convention
 * for a producer that declared a field null). `writeChecklistItemStatus`'s
 * explicit-clear (`null`) path exists in the module; nothing in this skeleton
 * drives it yet — a real caller wanting to clear a stored value needs its own
 * sentinel convention, not designed here.
 */
import { writeChecklistItemStatus, type ChecklistStatus } from '@colony/workflows/checklist';
import { emit, refuse, trimmed } from '../../.shared/io';

const VALID_STATUSES: readonly string[] = ['todo', 'doing', 'done', 'failed', 'skipped'];

function optionalText(value: string | undefined): string | undefined {
  const t = trimmed(value);
  return t === '' ? undefined : t;
}

async function main(): Promise<void> {
  const checklistPath = trimmed(process.env.INPUTS_CHECKLIST_PATH);
  const itemId = trimmed(process.env.INPUTS_ITEM_ID);
  const status = trimmed(process.env.INPUTS_STATUS);
  const expectedHash = trimmed(process.env.INPUTS_EXPECTED_HASH);

  if (checklistPath === '') throw new Error('checklist_path is required');
  if (itemId === '') throw new Error('item_id is required');
  if (expectedHash === '') throw new Error('expected_hash is required');
  if (!VALID_STATUSES.includes(status)) {
    throw new Error(`status must be one of ${VALID_STATUSES.join('|')}, got '${status}'`);
  }

  const { newHash } = await writeChecklistItemStatus({
    bug: optionalText(process.env.INPUTS_BUG),
    evidence: optionalText(process.env.INPUTS_EVIDENCE),
    expectedHash,
    itemId,
    path: checklistPath,
    projectRoot: process.cwd(),
    status: status as ChecklistStatus,
  });

  emit({ newHash, written: true });
}

main().catch((err: unknown) => {
  refuse(`record-result: ${err instanceof Error ? err.message : String(err)}`);
});
