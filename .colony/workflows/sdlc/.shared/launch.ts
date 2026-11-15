/**
 * Start another pack workflow detached, from the main checkout: the launching run's
 * worktree can be cleaned up before the new run reads it. Returns the new run's id.
 */

import { dirname } from 'node:path';
import { record, type QualifiedPr } from './forge.ts';
import { gitOrThrow } from './git.ts';
import { note } from './io.ts';
import { hostRpc } from './state.ts';

/**
 * The inputs a same-queue follow-up keeps: the launching run's own values. Identity and
 * the item targeted come from the item, so these name neither.
 */
export const BUILD_QUEUE_SELECTIONS = ['retriage_as', 'round_limit'] as const;
export type BuildQueueSelections = Record<(typeof BUILD_QUEUE_SELECTIONS)[number], string>;
export const MERGE_QUEUE_SELECTIONS = ['limit', 'merge_method', 'retriage_as'] as const;
export type MergeQueueSelections = Record<(typeof MERGE_QUEUE_SELECTIONS)[number], string>;

export interface LaunchOptions {
  /** Start with the run config this run was started with (`--config-from-run`). */
  readonly configFromRun?: string;
}

export function launchDetached(workflow: string, inputs: Record<string, string>, options: LaunchOptions = {}): string {
  // Local git only, never crosses the relay — kept as-is (task outcome: no params slot
  // for it today, and likely none needed under the new host-resolves-cwd architecture).
  dirname(gitOrThrow('rev-parse', '--path-format=absolute', '--git-common-dir').trim());
  const call = hostRpc('workflow.run', {
    workflow,
    inputs,
    detach: true,
    // `configFromRun` has no slot in today's WorkflowRunCallSchema (task outcome) —
    // sent anyway so the gap fails loud once workflow.run is implemented, not silently.
    ...(options.configFromRun === undefined ? {} : { configFromRun: options.configFromRun }),
  });
  if (!call.ok) throw new Error(`${workflow} did not start: ${call.error}`);
  const runId = record(call.result)?.runId;
  if (typeof runId !== 'string' || runId === '') throw new Error(`${workflow} acknowledged no run id`);
  return runId;
}

/**
 * Start an item's next build-queue round now, on the run config and input selections this
 * run started with. A failed launch is noted, and the released item waits for the next queue run.
 */
export function launchNextRound(item: QualifiedPr, runId: string, selections: BuildQueueSelections): string {
  try {
    const next = launchDetached(
      'colony-build-queue',
      { ...selections, repo_host: item.repo.host, repo_path: item.repo.path, number: String(item.number) },
      { configFromRun: runId }
    );
    return `its next round started at once (run ${next})`;
  } catch (error) {
    note(`issue ${String(item.number)}: the next round did not start, so the next queue run picks it up: ${error instanceof Error ? error.message : String(error)}`);
    return 'the next queue run picks it up';
  }
}
