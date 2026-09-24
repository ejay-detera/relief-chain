import { createClient } from 'npm:@supabase/supabase-js@2';

// Creates a pre-confirmed `lgu` account via the Auth Admin API so organization
// sign-up never requires email-OTP confirmation (Requirement 9.1), without
// touching the project-wide "Confirm email" Auth setting that beneficiary and
// merchant sign-up still rely on (Requirement 9.2 — their supabase.auth.signUp
// call path is completely untouched by this function).
//
// The caller (OrganizationRegistrationFlow) invokes this function first, then
// calls supabase.auth.signInWithPassword with the same credentials to
// establish the client-side session. This function only creates the account;
// it deliberately does not sign the caller in itself, so session storage stays
// entirely on the client via the existing Supabase client configuration.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type LguSignUpPayload = {
  email?: unknown;
  password?: unknown;
  metadata?: unknown;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  let payload: LguSignUpPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400);
  }

  const email = typeof payload.email === 'string' ? payload.email.trim() : '';
  const password = typeof payload.password === 'string' ? payload.password : '';
  const metadata =
    payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
      ? (payload.metadata as Record<string, unknown>)
      : {};

  if (!email || !password) {
    return jsonResponse({ error: 'Email and password are required.' }, 400);
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // The role is forced to 'lgu' here rather than trusted from the request body,
  // so this privileged, OTP-skipping path can never be used to pre-confirm a
  // beneficiary/merchant account.
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { ...metadata, role: 'lgu' },
  });

  if (error) return jsonResponse({ error: error.message }, 400);

  return jsonResponse({ userId: data.user?.id ?? null }, 200);
});
