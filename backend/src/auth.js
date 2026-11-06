
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { pool } from "./db.js";

function normalizePhone(input) {
  let phone = String(input ?? "").replace(/[^\d+]/g, "");

  if (phone.startsWith("+98")) {
    phone = "0" + phone.slice(3);
  } else if (phone.startsWith("0098")) {
    phone = "0" + phone.slice(4);
  } else if (phone.startsWith("98") && phone.length === 12) {
    phone = "0" + phone.slice(2);
  }

  if (!/^09\d{9}$/.test(phone)) {
    throw new Error("شماره موبایل معتبر نیست.");
  }

  return phone;
}

function hashOtp(phone, code) {
  const secret = process.env.OTP_HASH_SECRET;

  if (!secret) {
    throw new Error("OTP_HASH_SECRET تنظیم نشده است.");
  }

  return crypto
    .createHmac("sha256", secret)
    .update(`${phone}:${String(code)}`)
    .digest("hex");
}

export async function requestOtp(rawPhone) {
  const phone = normalizePhone(rawPhone);
  const cooldown = Number(process.env.OTP_RESEND_SECONDS || 60);

  const recent = await pool.query(
    `SELECT created_at
     FROM otp_challenges
     WHERE phone = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [phone]
  );

  if (recent.rowCount > 0) {
    const age =
      (Date.now() - new Date(recent.rows[0].created_at).getTime()) / 1000;

    if (age < cooldown) {
      throw new Error(
        `لطفاً ${Math.ceil(cooldown - age)} ثانیه دیگر تلاش کنید.`
      );
    }
  }

  const endpoint = process.env.MELIPAYAMAK_OTP_ENDPOINT;
  const apiKey = process.env.MELIPAYAMAK_API_KEY;

  if (!endpoint || !apiKey) {
    throw new Error("تنظیمات ملی پیامک کامل نیست.");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey
    },
    body: JSON.stringify({
      to: `+98${phone.slice(1)}`
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error("ارسال پیامک ناموفق بود.");
  }

  // ساختار پاسخ باید با مستندات حساب ملی پیامک تطبیق داده شود.
  const code = data.code ?? data.data?.code;

  if (!code) {
    throw new Error(
      "کد OTP در پاسخ سرویس پیدا نشد؛ ساختار پاسخ ملی پیامک باید بررسی شود."
    );
  }

  const ttl = Number(process.env.OTP_TTL_MINUTES || 5);

  await pool.query(
    `INSERT INTO otp_challenges
     (phone, code_hash, expires_at)
     VALUES ($1, $2, NOW() + ($3 || ' minutes')::interval)`,
    [phone, hashOtp(phone, code), ttl]
  );

  return { phone };
}

export async function verifyOtp(rawPhone, rawCode) {
  const phone = normalizePhone(rawPhone);
  const code = String(rawCode ?? "").trim();

  if (!/^\d{4,8}$/.test(code)) {
    throw new Error("کد تأیید معتبر نیست.");
  }

  const result = await pool.query(
    `SELECT *
     FROM otp_challenges
     WHERE phone = $1
       AND consumed_at IS NULL
       AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [phone]
  );

  if (result.rowCount === 0) {
    throw new Error("کد منقضی شده یا وجود ندارد.");
  }

  const challenge = result.rows[0];

  if (challenge.attempts >= 5) {
    throw new Error("تعداد تلاش‌ها بیش از حد مجاز است.");
  }

  const expected = Buffer.from(challenge.code_hash, "hex");
  const actual = Buffer.from(hashOtp(phone, code), "hex");

  const matches =
    expected.length === actual.length &&
    crypto.timingSafeEqual(expected, actual);

  if (!matches) {
    await pool.query(
      `UPDATE otp_challenges
       SET attempts = attempts + 1
       WHERE id = $1`,
      [challenge.id]
    );

    throw new Error("کد تأیید اشتباه است.");
  }

  await pool.query(
    `UPDATE otp_challenges
     SET consumed_at = NOW()
     WHERE id = $1`,
    [challenge.id]
  );

  const userResult = await pool.query(
    `INSERT INTO users (phone)
     VALUES ($1)
     ON CONFLICT (phone)
     DO UPDATE SET phone = EXCLUDED.phone
     RETURNING id, phone`,
    [phone]
  );

  const user = userResult.rows[0];

  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET تنظیم نشده است.");
  }

  const token = jwt.sign(
    {
      sub: String(user.id),
      phone: user.phone
    },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );

  return { user, token };
}
