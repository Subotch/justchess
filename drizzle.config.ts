import type { Config } from "drizzle-kit";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    host: "127.0.0.1",
    port: 5432,
    user: "justchess",
    password: "justchess_secret_pass",
    database: "justchess",
  },
  verbose: true,
  strict: true,
} satisfies Config;
