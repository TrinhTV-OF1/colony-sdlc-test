/**
 * Parent-workflow step: read the viewpoint catalog checklist (QD-15 — one item
 * per viewpoint, `done` is meaningless here since this file is a catalog, not
 * a run log) and emit the list `colony-autotest.yaml`'s `fan_out` expands
 * into one child run each.
 *
 * `checklist:` is a field B6's module does not know about — it round-trips
 * any comment field it does not recognize verbatim, so this pack can layer
 * its own field on top of the five B6 defines without touching B6 itself.
 * This is the first real consumer of that round-trip guarantee.
 */
import { readChecklist } from '@colony/workflows/checklist';
import { emit, refuse, trimmed } from '../../.shared/io';

interface Viewpoint {
  id: string;
  checklistPath: string;
}

async function main(): Promise<void> {
  const catalogPath = trimmed(process.env.INPUTS_VIEWPOINT_CATALOG_PATH);
  if (catalogPath === '') throw new Error('viewpoint_catalog_path is required');

  const { items } = await readChecklist(catalogPath, process.cwd());
  const viewpoints: Viewpoint[] = [];

  for (const item of items) {
    const checklistPath = item.extraFields.find(([key]) => key === 'checklist')?.[1];
    if (checklistPath === undefined) {
      throw new Error(`Viewpoint '${item.id}' has no 'checklist' comment field (the per-viewpoint test-case checklist path)`);
    }
    viewpoints.push({ checklistPath, id: item.id });
  }

  emit({ viewpoints });
}

main().catch((err: unknown) => {
  refuse(`read-viewpoints: ${err instanceof Error ? err.message : String(err)}`);
});
