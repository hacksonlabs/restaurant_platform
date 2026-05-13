import { Pool } from 'pg';
import crypto from 'node:crypto';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
const base = 'http://localhost:3031';

const login = await fetch(base + '/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'dev@rest.com', password: 'password' }),
});
const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
const token = decodeURIComponent(cookie.split('=')[1]);
const tokenHash = hash(token);
console.log('tokenHash', tokenHash);

let result = await pool.query(
  'select id, selected_restaurant_id, selected_location_id from operator_sessions where session_token_hash = $1',
  [tokenHash],
);
console.log('before', result.rows);

const sel = await fetch(base + '/api/auth/select-tenant', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({ restaurantId: 'rest_pizza_palace' }),
});
console.log('selectStatus', sel.status, await sel.text());

result = await pool.query(
  'select id, selected_restaurant_id, selected_location_id from operator_sessions where session_token_hash = $1',
  [tokenHash],
);
console.log('after', result.rows);

await pool.end();
