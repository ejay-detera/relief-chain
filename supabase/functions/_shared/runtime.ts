// Deno runtime accessor.
//
// The project-wide `tsconfig.json` includes `supabase/functions/**/*.ts` in the
// Node type-check, and the Node lib has no `Deno` global. Every shared module
// therefore avoids touching Deno so it stays green under `tsc`. The per-function
// index.ts entrypoints DO need `Deno.serve` and `Deno.env`, so this module is the
// single, centralized place that reaches the runtime — and it does so through
// `globalThis` WITHOUT ever referencing the `Deno` global type, so it keeps
// type-checking cleanly under the Node compiler while running under Deno.
//
// Validates: Requirements 18.3, 20.5, 20.8

/** The narrow slice of the Deno runtime the Edge Functions actually use. */
interface DenoRuntime {
  readonly env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): { finished: Promise<void> };
}

const resolveRuntime = (): DenoRuntime => {
  const candidate = (globalThis as { Deno?: DenoRuntime }).Deno;
  if (!candidate || typeof candidate.serve !== 'function' || !candidate.env) {
    throw new Error('This module must run inside the Supabase Edge (Deno) runtime.');
  }
  return candidate;
};

/** Reads a named environment variable from the Deno runtime. */
export const readEnv = (name: string): string | undefined => resolveRuntime().env.get(name);

/** Registers the HTTP handler with the Deno runtime. */
export const serveEdge = (
  handler: (request: Request) => Response | Promise<Response>,
): void => {
  resolveRuntime().serve(handler);
};
