// In-browser mock of the Supabase API for recording the REAL app UI.
//
// The Expo web app is started with EXPO_PUBLIC_SUPABASE_URL pointing at
// MOCK_ORIGIN (nothing listens there). Playwright intercepts every request to
// that origin and answers with demo data, so the real screens, components, and
// navigation render exactly as shipped. Nothing reaches a real database or the
// Stellar network. All data is placeholder demo data.
export const MOCK_ORIGIN = 'http://127.0.0.1:54399';
const STORAGE_KEY = 'sb-127-auth-token'; // supabase-js: sb-<first host label>-auth-token

export const USERS = {
  lgu: { id: '11111111-1111-4111-8111-111111111111', email: 'admin@example.com' },
  beneficiary: { id: '22222222-2222-4222-8222-222222222222', email: 'beneficiary@example.com' },
  merchant: { id: '33333333-3333-4333-8333-333333333333', email: 'merchant@example.com' },
};

const fakeJwt = (sub) => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', exp: 4102444800, aud: 'authenticated' })}.demo`;
};

export const sessionFor = (role) => {
  const u = USERS[role];
  return {
    access_token: fakeJwt(u.id),
    refresh_token: 'demo-refresh',
    token_type: 'bearer',
    expires_in: 3600 * 24 * 365,
    expires_at: 4102444800,
    user: { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, app_metadata: {}, user_metadata: { role }, created_at: '2026-09-01T00:00:00Z' },
  };
};

export const initSessionScript = (role) =>
  `try { localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(JSON.stringify(sessionFor(role)))}); } catch (e) {}`;

/**
 * Installs the mock on a Playwright page.
 * @param page Playwright page
 * @param data { tables: { [table]: rows[] | (url, req) => rows }, rpc: {...}, functions: {...} }
 * @param log  array that receives unhandled request descriptions
 */
export const installMock = async (page, data, log = []) => {
  await page.routeWebSocket(/127\.0\.0\.1:54399/, (ws) => {
    ws.onMessage((msg) => {
      // Phoenix channel protocol: ack joins/heartbeats so realtime stays quiet.
      try {
        const m = JSON.parse(String(msg));
        const [joinRef, ref, topic, event] = Array.isArray(m) ? m : [m.join_ref, m.ref, m.topic, m.event];
        if (event === 'phx_join' || event === 'heartbeat' || event === 'access_token') {
          const reply = { status: 'ok', response: event === 'phx_join' ? { postgres_changes: [] } : {} };
          ws.send(JSON.stringify(Array.isArray(m) ? [joinRef, ref, topic, 'phx_reply', reply] : { join_ref: joinRef, ref, topic, event: 'phx_reply', payload: reply }));
        }
      } catch { /* ignore */ }
    });
  });

  await page.route(`${MOCK_ORIGIN}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'content-range' };
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const json = (body, status = 200, extra = {}) => route.fulfill({ status, headers: { ...headers, 'content-type': 'application/json', ...extra }, body: JSON.stringify(body) });

    const p = url.pathname;
    if (p.startsWith('/auth/v1/')) {
      const role = Object.keys(USERS).find((r) => (req.headers().authorization ?? '').includes(fakeJwt(USERS[r].id))) ?? data.role;
      if (p.endsWith('/user')) return json(sessionFor(role).user);
      if (p.endsWith('/logout')) return route.fulfill({ status: 204, headers });
      if (p.endsWith('/token')) return json(sessionFor(data.role));
      return json({});
    }

    if (p.startsWith('/rest/v1/rpc/')) {
      const fn = p.slice('/rest/v1/rpc/'.length);
      const h = data.rpc?.[fn];
      if (h === undefined) log.push(`RPC ${fn} ${req.postData()?.slice(0, 200) ?? ''}`);
      const body = typeof h === 'function' ? h(url, req) : h ?? null;
      return json(body);
    }

    if (p.startsWith('/rest/v1/')) {
      const table = p.slice('/rest/v1/'.length);
      const single = (req.headers().accept ?? '').includes('vnd.pgrst.object');
      const h = data.tables?.[table];
      if (h === undefined) log.push(`${method} ${table}?${url.searchParams.toString().slice(0, 240)}`);
      if (method !== 'GET' && method !== 'HEAD') {
        const posted = req.postData() ? JSON.parse(req.postData()) : {};
        const rows = Array.isArray(posted) ? posted : [{ id: crypto.randomUUID(), ...posted }];
        return json(single ? rows[0] : rows, 201);
      }
      let rows = typeof h === 'function' ? h(url, req) : h ?? [];
      rows = filterRows(rows, url.searchParams);
      const count = rows.length;
      const extra = { 'content-range': `0-${Math.max(0, count - 1)}/${count}` };
      if (method === 'HEAD') return route.fulfill({ status: 200, headers: { ...headers, ...extra } });
      if (single) return json(rows[0] ?? null, rows[0] ? 200 : 406, extra);
      return json(rows, 200, extra);
    }

    if (p.startsWith('/functions/v1/')) {
      const fn = p.slice('/functions/v1/'.length);
      const h = data.functions?.[fn];
      if (h === undefined) log.push(`FN ${fn} ${req.postData()?.slice(0, 200) ?? ''}`);
      return json(typeof h === 'function' ? h(url, req) : h ?? {});
    }

    if (p.startsWith('/storage/v1/')) return json([]);
    log.push(`OTHER ${method} ${p}`);
    return json({});
  });
};

// Minimal PostgREST filter support (eq / in / is) so per-user queries match.
const filterRows = (rows, params) => {
  let out = Array.isArray(rows) ? rows : [rows];
  for (const [key, raw] of params.entries()) {
    if (['select', 'order', 'limit', 'offset', 'or', 'and'].includes(key)) continue;
    const m = raw.match(/^(eq|in|is)\.(.*)$/);
    if (!m) continue;
    const [, op, val] = m;
    if (key.includes('.')) continue; // embedded-resource filters: ignore
    out = out.filter((r) => {
      if (!(key in r)) return true;
      const v = r[key];
      if (op === 'eq') return String(v) === decodeURIComponent(val);
      if (op === 'is') return val === 'null' ? v == null : String(v) === val;
      if (op === 'in') return val.replace(/[()]/g, '').split(',').map((s) => s.replace(/"/g, '')).includes(String(v));
      return true;
    });
  }
  return out;
};
