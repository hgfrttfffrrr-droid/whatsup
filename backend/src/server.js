import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";

import { initDb, pool } from "./db.js";
import { requestOtp, verifyOtp } from "./auth.js";

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(",")
      : false
  })
);

app.use(express.json({ limit: "32kb" }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "GAPROM API",
    message: "سرور گپروم فعال است."
  });
});

app.post("/auth/request-otp", authLimiter, async (req, res) => {
  try {
    const result = await requestOtp(req.body?.phone);

    res.json({
      ok: true,
      message: "درخواست ارسال کد ثبت شد.",
      phone: result.phone
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error.message
    });
  }
});

app.post("/auth/verify-otp", authLimiter, async (req, res) => {
  try {
    const result = await verifyOtp(
      req.body?.phone,
      req.body?.code
    );

    res.json({
      ok: true,
      ...result
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error.message
    });
  }
});

// شناسایی کاربر با توکن JWT
app.get("/auth/me", async (req, res) => {
  try {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      return res.status(401).json({
        ok: false,
        error: "توکن ورود ارسال نشده است."
      });
    }

    const token = authorization.substring(7);

    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const result = await pool.query(
      "SELECT id, phone FROM users WHERE id = $1",
      [payload.sub]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({
        ok: false,
        error: "کاربر پیدا نشد."
      });
    }

    return res.json({
      ok: true,
      user: {
        id: result.rows[0].id,
        phone: result.rows[0].phone,
        name: "",
        profileImage: ""
      }
    });
  } catch (error) {
    return res.status(401).json({
      ok: false,
      error: "توکن نامعتبر یا منقضی شده است."
    });
  }
});

const PORT = Number(process.env.PORT || 3000);

try {
  await initDb();

  app.listen(PORT, () => {
    console.log(`GAPROM API running on port ${PORT}`);
  });
} catch (error) {
  console.error("Database initialization failed:", error);
  process.exit(1);
}
