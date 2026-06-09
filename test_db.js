const postgres = require("postgres");
const url = "postgresql://justchess:justchess_secret_pass@127.0.0.1/justchess";
console.log("URL:", url);
const sql = postgres(url, { debug: true });
sql`SELECT 1`.then(r => {
  console.log("OK", r);
  sql.end();
}).catch(e => {
  console.error("FAIL code:", e.code);
  console.error("FAIL message:", e.message);
  sql.end();
});