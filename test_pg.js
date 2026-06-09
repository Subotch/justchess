const { Client } = require("pg");
const client = new Client({
  host: "127.0.0.1",
  port: 5432,
  user: "justchess",
  password: "justchess_pass",
  database: "justchess",
});
client.connect()
  .then(() => client.query("SELECT 1"))
  .then(r => {
    console.log("OK", r.rows);
    client.end();
  })
  .catch(e => {
    console.error("FAIL code:", e.code);
    console.error("FAIL message:", e.message);
    client.end();
  });