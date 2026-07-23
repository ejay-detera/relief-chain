const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long';
const userId = 'b404f131-3bc0-4148-9e00-4ae6978f6464';

const token = jwt.sign({
  role: 'authenticated',
  aud: 'authenticated',
  sub: userId,
  exp: Math.floor(Date.now() / 1000) + 60 * 60,
}, JWT_SECRET);

const supabase = createClient('http://127.0.0.1:54321', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0', {
  global: {
    headers: {
      Authorization: `Bearer ${token}`
    }
  }
});

async function test() {
  const { data, error } = await supabase
    .from('wallets')
    .select('id, network, address, is_active, owner_id')
    .eq('purpose', 'merchant_settlement')
    .eq('network', 'stellar_testnet')
    .eq('is_active', true)
    .eq('verification_status', 'verified')
    .limit(1);

  console.log('Data:', data);
  console.log('Error:', error);
}

test();
