// Edge Function view of the canonical signed-invoice codec.
//
// The protocol itself lives in the shared, runtime-portable module so mobile,
// Edge Functions, and the Rust contract-test fixtures all agree on one wire
// format. This file simply re-exports it with the explicit `.ts` extension Deno
// requires, mirroring how `stellar/config.ts` re-exports `shared/stellar-config`.
//
// Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 19.1

export * from '../../../../shared/invoice-codec.ts';
