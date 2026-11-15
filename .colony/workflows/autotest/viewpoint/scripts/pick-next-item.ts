/**
 * Child-workflow loop_group body step (first node of each iteration): read the
 * viewpoint's own test-case checklist (QD-14) and hand the next unresolved
 * item to `verify`. `done: true` with no item ends the loop — `record`'s own
 * `when:` skips on the same condition, and `until_bash` reads this node's
 * `done` field directly (same iteration, not `$LOOP_PREV`).
 *
 * Always re-reads the file: the previous iteration's `record` may have
 * changed its content hash, and the next write's optimistic lock needs the
 * hash as of THIS read, not a stale one carried over from iteration start.
 */
import { readChecklist } from '@colony/workflows/checklist';
import { emit, refuse, trimmed } from '../../.shared/io';

async function main(): Promise<void> {
  const checklistPath = trimmed(process.env.INPUTS_CHECKLIST_PATH);
  if (checklistPath === '') throw new Error('checklist_path is required');

  const { contentHash, items } = await readChecklist(checklistPath, process.cwd());
  const next = items.find((item) => item.status === 'todo');

  if (next === undefined) {
    emit({ contentHash: null, done: true, itemId: null, text: null });
    return;
  }

  emit({ contentHash, done: false, itemId: next.id, text: next.text });
}

main().catch((err: unknown) => {
  refuse(`pick-next-item: ${err instanceof Error ? err.message : String(err)}`);
});
