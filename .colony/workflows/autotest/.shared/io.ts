/**
 * The process contract every script node in this pack shares — same shape as
 * `sdlc/.shared/io.ts`, kept as its own copy rather than a cross-pack import:
 * `.shared/` is a pack-local convention, and this pack should not depend on
 * sdlc's internals to run.
 *
 * Read every `with:` binding as `process.env.INPUTS_<NAME>` at its own call
 * site. Never call `process.exit()` — set `process.exitCode` and return, so
 * Bun flushes stdout before the process leaves.
 */

function setFailed(): void {
  process.exitCode = 1;
}

/** A bound input's value, or the empty string when the binding is absent. */
export function text(value: string | undefined): string {
  return value ?? '';
}

/** A bound input's value with surrounding whitespace removed. */
export function trimmed(value: string | undefined): string {
  return (value ?? '').trim();
}

/** The node's result: one strict JSON document on stdout. */
export function emit(value: unknown): void {
  console.log(JSON.stringify(value));
}

/** The node's refusal: the reason on stderr, a non-zero exit, nothing on stdout. */
export function refuse(message: string): void {
  console.error(message);
  setFailed();
}
