/**
 * The pack's state store and run reads, through the host relay
 * (`COLONY_HOST_RPC_URL`/`COLONY_HOST_RPC_KEY`, `03-giao-thuc-runner-host.md` §2-4).
 *
 * A queue's work item is a state document claimed with a conditional write
 * (`statePut` at the revision read). A claim is released only when the engine reports
 * the claiming run terminal, never on age.
 */

import { record } from './forge.ts';
import { text } from './io.ts';

const STATE_REVISION_CONFLICT = 'STATE_REVISION_CONFLICT';

/** This run's id, which the host checks every relay call's key against (`03` §3.2). */
function selfRunId(): string {
  const value = text(process.env.WORKFLOW_ID);
  if (value === '') throw new Error('WORKFLOW_ID is not set; the engine supplies it to every exec node');
  return value;
}

/**
 * One call to the host relay (loopback HTTP, `02-script-tren-machine.md` §3.6).
 * `fetch` has no synchronous form, so this bridges through a one-line `bun -e`
 * subprocess (`04-sua-script-state.md` §2.3 phương án C) — every public function
 * below stays synchronous, so none of the 47 scripts needs to add `await`.
 * No auto-retry on timeout (task outcome: not an acceptance criterion here).
 */
export function hostRpc(
  method: string,
  params: Record<string, unknown>
): { ok: true; result: unknown } | { ok: false; error: string } {
  const url = process.env.COLONY_HOST_RPC_URL;
  const key = process.env.COLONY_HOST_RPC_KEY;
  if (url === undefined || url === '' || key === undefined || key === '') {
    throw new Error(
      'COLONY_HOST_RPC_URL/COLONY_HOST_RPC_KEY is not set; the engine supplies both to every exec node.'
    );
  }
  const bridge = Bun.spawnSync(
    [
      // The running Bun binary itself, not the bare name "bun": on Windows that name
      // often resolves to a .cmd shim, and Bun.spawnSync refuses to pass this script's
      // special characters (quotes, braces, semicolons) through a .cmd/.bat wrapper
      // (confirmed by reproducing it directly — task outcome).
      process.execPath,
      '-e',
      // argv: [url, key]. Reads the {method,params} envelope from stdin, posts it to
      // the loopback relay, and writes the relay's raw JSON response to stdout.
      "const [url, key] = [process.argv[1], process.argv[2]];" +
        'const body = await Bun.stdin.text();' +
        'try {' +
        "const res = await fetch(new URL('/rpc', url), {" +
        "method: 'POST'," +
        "headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }," +
        'body,' +
        'signal: AbortSignal.timeout(20000),' +
        '});' +
        'process.stdout.write(await res.text());' +
        '} catch (error) {' +
        "process.stdout.write(JSON.stringify({ ok: false, error: 'HOST_RPC_UNREACHABLE: ' + String(error) }));" +
        '}',
      url,
      key,
    ],
    {
      env: process.env,
      stdin: Buffer.from(JSON.stringify({ method, params: { ...params, runId: selfRunId() } })),
      stdout: 'pipe',
      stderr: 'pipe',
    }
  );
  if (bridge.exitCode !== 0) {
    return { ok: false, error: `HOST_RPC_BRIDGE_FAILED: ${bridge.stderr.toString().trim()}` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bridge.stdout.toString());
  } catch {
    return { ok: false, error: 'HOST_RPC_MALFORMED_RESPONSE' };
  }
  const body = record(parsed);
  if (body?.ok === true) return { ok: true, result: body.result ?? null };
  const error = typeof body?.error === 'string' ? body.error : 'HOST_RPC_MALFORMED_RESPONSE';
  return { ok: false, error };
}

function failed(what: string, error: string): Error {
  return new Error(`${what} failed: ${error}`);
}

export interface Stored {
  readonly revision: number;
  readonly value: unknown;
}

/** What `state.get` means by a `null` result: the document has no revision yet. */
const UNWRITTEN: Stored = { revision: 0, value: null };

export function stateGet(name: string): Stored {
  const call = hostRpc('state.get', { name });
  if (!call.ok) throw failed(`state get ${name}`, call.error);
  if (call.result === null) return UNWRITTEN;
  const value = record(call.result);
  if (typeof value?.revision !== 'number') throw failed(`state get ${name}`, 'HOST_RPC_MALFORMED_RESULT');
  return { revision: value.revision, value: value.value ?? null };
}

/** A conditional replace: `conflict` when the document moved past `ifRevision`. */
export function statePut(name: string, value: unknown, ifRevision: number): 'ok' | 'conflict' {
  const call = hostRpc('state.put', { name, value, ifRevision });
  if (!call.ok) {
    if (call.error === STATE_REVISION_CONFLICT) return 'conflict';
    throw failed(`state put ${name}`, call.error);
  }
  return 'ok';
}

export type StatePatchOp =
  | { readonly op: 'set'; readonly path: string; readonly value: unknown }
  | { readonly op: 'append'; readonly path: string; readonly value: unknown };

/** Apply ops to the latest revision; a patch never conflicts. */
export function statePatch(name: string, ops: readonly StatePatchOp[]): void {
  const call = hostRpc('state.patch', { name, ops });
  if (!call.ok) throw failed(`state patch ${name}`, call.error);
}

/** Append to an array in the latest revision; appends never conflict. */
export function stateAppend(name: string, path: string, value: unknown): void {
  statePatch(name, [{ op: 'append', path, value }]);
}

/**
 * Every live document under the prefix with its value, in one read.
 *
 * `state.list` answers names/revisions only, no value (task outcome: confirmed
 * against the host's real handler) — one further `state.get` per live name.
 */
export function stateDocuments(prefix: string): (Stored & { readonly name: string })[] {
  const call = hostRpc('state.list', { prefix });
  if (!call.ok) throw failed('state list', call.error);
  const documents = record(call.result)?.documents;
  if (!Array.isArray(documents)) throw failed('state list', 'HOST_RPC_MALFORMED_RESULT');
  return documents
    .map(record)
    .filter((row): row is Record<string, unknown> => row !== undefined && row.deleted !== true)
    .map(row => {
      if (typeof row.name !== 'string') throw failed('state list', 'HOST_RPC_MALFORMED_RESULT');
      return { name: row.name, ...stateGet(row.name) };
    });
}

/** One run as the host's `workflow.get` reports it, or undefined when it reports none. */
export function runDetail(runId: string): Record<string, unknown> | undefined {
  const call = hostRpc('workflow.get', { targetRunId: runId });
  return call.ok ? record(call.result) : undefined;
}

/** The run's status as the engine reports it, or null when it gives no status. */
export function runStatus(runId: string): string | null {
  const status = runDetail(runId)?.status;
  return typeof status === 'string' ? status : null;
}

/**
 * This project's runs, newest first, as the host's `workflow.runs` lists them.
 * Refuses a listing that fell back to every project's runs: draining another
 * project's runs into this repository would be a wrong write, not a wider read.
 */
export function listRuns(limit: number): Record<string, unknown>[] {
  const call = hostRpc('workflow.runs', { filter: { limit } });
  if (!call.ok) throw failed('workflow runs', call.error);
  const value = record(call.result);
  if (!Array.isArray(value?.runs)) throw failed('workflow runs', 'HOST_RPC_MALFORMED_RESULT');
  if (value.scopeFallback === true) {
    throw new Error('workflow runs could not scope the listing to this project');
  }
  return value.runs.map(record).filter((row): row is Record<string, unknown> => row !== undefined);
}

/** Whether a pickup may release a claim, from the claiming run's status. */
export function claimDisposition(status: string | null): 'hold' | 'release' {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
    ? 'release'
    : 'hold';
}
