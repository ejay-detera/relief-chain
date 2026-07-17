const fs = require('fs');
let env = fs.readFileSync('.env', 'utf8');
const token = env.split('\n').find(line => line.includes('ANON_KEY=')).split('=')[1].trim().replace(/['"]/g, '');
fetch('http://127.0.0.1:54321/functions/v1/prepare-payment', {
  method: 'POST',
  body: JSON.stringify({ invoice: {}, fundingSourceId: '123', fundingSourceKind: 'cash' }),
  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
}).then(async r => { console.log(r.status); console.log(await r.text()); }).catch(console.error);
