import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";

import { initDb, pool } from "./db.js";
import { requestOtp, verifyOtp } from "./auth.js";

const app = express();

// Security
app.use(helmet());

app.use(
  cors({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(",")
      : false
  })
);

app.use(express.json({ limit: "32kb" }));

// Rate limit
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false
});

// JWT authentication middleware
function authenticateToken(req, res, next) {
  try {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      return res.status(401).json({
        ok: false,
        error: "ابتدا وارد حساب خود شوید."
      });
    }

    const token = authorization.substring(7);

    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    req.userId = payload.sub;

    next();
  } catch (error) {
    return res.status(401).json({
      ok: false,
      error: "توکن نامعتبر یا منقضی شده است."
    });
  }
}

// Health check
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "GAPROM API",
    message: "سرور گپروم فعال است."
  });
});

// Request OTP
app.post("/auth/request-otp", authLimiter, async (req, res) => {
  try {
    const result = await requestOtp(req.body?.phone);

    return res.json({
      ok: true,
      message: "درخواست ارسال کد ثبت شد.",
      phone: result.phone
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error: error.message
    });
  }
});

// Verify OTP
app.post("/auth/verify-otp", authLimiter, async (req, res) => {
  try {
    const result = await verifyOtp(
      req.body?.phone,
      req.body?.code
    );

    return res.json({
      ok: true,
      ...result
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error: error.message
    });
  }
});

// Get current user
app.get("/auth/me", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, phone, name, profile_image, is_online
       FROM users
       WHERE id = $1`,
      [req.userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        ok: false,
        error: "کاربر پیدا نشد."
      });
    }

    const user = result.rows[0];

    return res.json({
      ok: true,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        profileImage: user.profile_image,
        isOnline: user.is_online
      }
    });
  } catch (error) {
    console.error("Get user error:", error);

    return res.status(500).json({
      ok: false,
      error: "خطا در دریافت اطلاعات کاربر."
    });
  }
});

// Create or update user profile
app.put("/users/profile", authenticateToken, async (req, res) => {
  try {
    const name = String(req.body?.name ?? "").trim();
    const profileImage = String(
      req.body?.profileImage ?? ""
    ).trim();

    if (!name || name.length > 100) {
      return res.status(400).json({
        ok: false,
        error: "نام کاربر باید بین ۱ تا ۱۰۰ کاراکتر باشد."
      });
    }

    const result = await pool.query(
      `UPDATE users
       SET name = $1,
           profile_image = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING id, phone, name, profile_image, is_online`,
      [name, profileImage, req.userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        ok: false,
        error: "کاربر پیدا نشد."
      });
    }

    const user = result.rows[0];

    return res.json({
      ok: true,
      message: "پروفایل با موفقیت ذخیره شد.",
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        profileImage: user.profile_image,
        isOnline: user.is_online
      }
    });
  } catch (error) {
    console.error("Update profile error:", error);

    return res.status(500).json({
      ok: false,
      error: "ذخیره پروفایل با خطا مواجه شد."
    });
  }
});

// Update online status
app.put("/users/online-status", authenticateToken, async (req, res) => {
  try {
    const isOnline = req.body?.isOnline;

    if (typeof isOnline !== "boolean") {
      return res.status(400).json({
        ok: false,
        error: "وضعیت آنلاین معتبر نیست."
      });
    }

    await pool.query(
      `UPDATE users
       SET is_online = $1,
           last_seen = CASE
             WHEN $1 = FALSE THEN NOW()
             ELSE last_seen
           END,
           updated_at = NOW()
       WHERE id = $2`,
      [isOnline, req.userId]
    );

    return res.json({
      ok: true,
      isOnline
    });
  } catch (error) {
    console.error("Online status error:", error);

    return res.status(500).json({
      ok: false,
      error: "به‌روزرسانی وضعیت آنلاین ناموفق بود."
    });
  }
});

// Start server
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
