import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import bcrypt from "bcryptjs";
import { generateAuthToken } from "@/lib/auth";
import { RateLimiterRedis } from "rate-limiter-flexible";
import Redis from "ioredis";

let redisClient: Redis | null = null;

const getRedisClient = (): Redis => {
  if (!redisClient) {
    redisClient = new Redis({ host: "redis", port: 6379 });

    redisClient.on("error", (err) => {
      console.error("Redis Client Error", err);
      redisClient = null;
    });
  }
  return redisClient;
};

const ipLimiter = new RateLimiterRedis({
  storeClient: getRedisClient(),
  keyPrefix: "login_fail_ip",
  points: 5,
  duration: 60 * 20,
  blockDuration: 60 * 20,
});

const usernameLimiter = new RateLimiterRedis({
  storeClient: getRedisClient(),
  keyPrefix: "login_fail_username",
  points: 5,
  duration: 60 * 20,
  blockDuration: 60 * 20,
});

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") ?? "127.0.0.1";
  const { email, password } = await request.json();

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  try {
    await Promise.all([ipLimiter.consume(ip), usernameLimiter.consume(email.toLowerCase())]);
  } catch (rejRes) {
    console.log(rejRes);

    return NextResponse.json({ error: "Too Many Requests. Please try again later." }, { status: 429 });
  }

  try {
    const client = await pool.connect();
    try {
      const userResult = await client.query("SELECT id, email, password_hash FROM users WHERE email = $1", [email]);
      const user = userResult.rows[0];

      if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
      }

      await Promise.all([ipLimiter.delete(ip), usernameLimiter.delete(email.toLowerCase())]);

      const token = await generateAuthToken(user.id, user.email);
      const response = NextResponse.json({
        message: "Login successful",
        user: { id: user.id, email: user.email },
        token: token,
      });

      return response;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Internal server error during login" }, { status: 500 });
  }
}
