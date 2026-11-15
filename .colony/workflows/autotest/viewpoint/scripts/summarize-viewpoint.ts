/**
 * Child-workflow terminal step: stamp the reviewing agent's verdict with this
 * run's own viewpoint id. The parent's fan-out aggregates children by array
 * position, but carrying the id explicitly means a result is still
 * self-describing if that ever changes.
 */
import { emit, refuse, trimmed } from '../../.shared/io';

function parseIds(raw: string): string[] {
  if (raw === '') return [];
  return JSON.parse(raw) as string[];
}

async function main(): Promise<void> {
  const viewpointId = trimmed(process.env.INPUTS_VIEWPOINT_ID);
  const verdict = trimmed(process.env.INPUTS_VERDICT);
  if (viewpointId === '') throw new Error('viewpoint_id is required');
  if (verdict !== 'reviewed_ok' && verdict !== 'concerns') {
    throw new Error(`verdict must be 'reviewed_ok' or 'concerns', got '${verdict}'`);
  }

  emit({
    flaggedItemIds: parseIds(trimmed(process.env.INPUTS_FLAGGED_ITEM_IDS)),
    verdict,
    viewpointId,
  });
}

main().catch((err: unknown) => {
  refuse(`summarize-viewpoint: ${err instanceof Error ? err.message : String(err)}`);
});
