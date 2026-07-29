import type { Config } from "drizzle-kit";

export default {
  schema: "./db/schema/*",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
 