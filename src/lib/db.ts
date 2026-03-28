import { Pool, types } from "pg";

// Parse NUMERIC (OID 1700) as float
types.setTypeParser(1700, (val) => (val === null ? null : parseFloat(val)));

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
