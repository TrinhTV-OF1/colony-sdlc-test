/**
 * Parent-workflow step after the fan-out finishes (`join: all_done`): tally
 * each viewpoint's child outcome into one typed result for the run's
 * `returns:`. A `colony_failed` marker (the engine's own shape for a
 * failed/cancelled fan-out slot under `all_done` — see workflow-node.ts) is
 * read as 'failed'; anything else is the child's own `review-viewpoint`
 * outcome passed through.
 */
import { emit, refuse, trimmed } from '../../.shared/io';

interface ChildFailedMarker {
  colony_failed: true;
  error?: string;
  status?: string;
}

interface ChildOutcome {
  verdict?: string;
  viewpointId?: string;
}

function isFailedMarker(value: unknown): value is ChildFailedMarker {
  return typeof value === 'object' && value !== null && (value as { colony_failed?: unknown }).colony_failed === true;
}

async function main(): Promise<void> {
  const raw = trimmed(process.env.INPUTS_RESULTS);
  const results = (raw === '' ? [] : JSON.parse(raw)) as unknown[];

  let passed = 0;
  let concerns = 0;
  let failed = 0;

  for (const entry of results) {
    if (isFailedMarker(entry)) {
      failed += 1;
      continue;
    }
    const outcome = entry as ChildOutcome;
    if (outcome.verdict === 'reviewed_ok') passed += 1;
    else concerns += 1;
  }

  emit({ concerns, failed, passed, totalViewpoints: results.length });
}

main().catch((err: unknown) => {
  refuse(`summarize-run: ${err instanceof Error ? err.message : String(err)}`);
});
