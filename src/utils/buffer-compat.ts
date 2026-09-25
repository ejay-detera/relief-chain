import { Buffer } from 'buffer';

/**
 * Hermes/XDR compatibility for Stellar transaction parsing.
 *
 * Diagnosed 2026-09-25 on-device: `Uint8Array.prototype.subarray` does not
 * honor the Buffer subclass species on this runtime, so fixed-width XDR reads
 * (e.g. the 12-byte asset code) come back as plain `Uint8Array` whose
 * `toString()` comma-joins byte values (`"82,67,80,..."`) instead of decoding
 * them (`"RCPHP\0..."`). The Stellar SDK's asset validation then rejects the
 * decoded transaction even though the bytes are correct — every `fromXDR`
 * device-signing path (provisioning, payments, Soroban auth) is affected.
 *
 * The repair restores the Buffer prototype on subarray views, mirroring the
 * workaround buffer@6 already applies inside `slice()`. It is scoped to the
 * result prototype only; no decode behavior changes.
 */

/** Restores the Buffer prototype on a view that lost it (no-op when intact). */
export const repairBufferSubarrayView = (view: Uint8Array): Buffer => {
  if (Object.getPrototypeOf(view) !== Buffer.prototype) {
    Object.setPrototypeOf(view, Buffer.prototype);
  }
  return view as Buffer;
};

const PATCH_MARKER = '__reliefChainBufferSubarrayPatched';

type PatchableSubarray = ((start?: number, end?: number) => Uint8Array) & {
  [PATCH_MARKER]?: true;
};

/**
 * Idempotent startup patch: wraps `Buffer.prototype.subarray` so its results
 * always carry the Buffer prototype, even on runtimes with broken typed-array
 * species. Safe to call on runtimes where subarray already behaves (Node).
 */
export const ensureBufferSubarrayReturnsBuffer = (): void => {
  const current = Buffer.prototype.subarray as PatchableSubarray;
  if (current[PATCH_MARKER]) return;
  const nativeSubarray = current;
  const patched = function (
    this: Buffer,
    start?: number,
    end?: number,
  ): Buffer {
    return repairBufferSubarrayView(nativeSubarray.call(this, start, end));
  } as PatchableSubarray;
  patched[PATCH_MARKER] = true;
  Buffer.prototype.subarray = patched as typeof Buffer.prototype.subarray;
};
