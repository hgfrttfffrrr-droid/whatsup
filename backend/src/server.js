
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { initDb } from "./db.js";
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
