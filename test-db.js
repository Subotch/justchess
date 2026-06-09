const postgres = require('postgres');

const sql = postgres('postgresql://justchess:justchess_secret_pass@127.0.0.1:5432/justchess');

sql`SELECT 1 as test`.then(r => {
  console.log('postgres lib OK:', r);
  sql.end();
}).catch(e => {
  console.error('postgres lib FAIL:', e.code, e.message);
  process.exit(1);
});