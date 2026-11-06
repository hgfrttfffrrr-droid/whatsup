import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      phone VARCHAR(16) UNIQUE NOT NULL,
      name VARCHAR(100) NOT NULL DEFAULT '',
      profile_image TEXT NOT NULL DEFAULT '',
      is_online BOOLEAN NOT NULL DEFAULT FALSE,
      last_seen TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS name VARCHAR(100) NOT NULL DEFAULT '';

    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS profile_image TEXT NOT NULL DEFAULT '';

    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT FALSE;

    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;

    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

    CREATE TABLE IF NOT EXISTS otp_challenges (
      id BIGSERIAL PRIMARY KEY,
      phone VARCHAR(16) NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS otp_phone_created_idx
    ON otp_challenges(phone, created_at DESC);
  `);
}
