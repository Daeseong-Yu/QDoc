import { createHash } from "node:crypto";
import { createConnection, type Socket } from "node:net";

type RedisReply = number | string | null;

type RateLimitPolicy = {
  name: string;
  key: string;
  limit: number;
  windowSeconds: number;
};

type RateLimitResult =
  | {
      allowed: true;
    }
  | {
      allowed: false;
      policy: string;
      retryAfterSeconds: number;
    };

const redisTimeoutMs = 1000;
const redisRateLimitScript =
  "local current = redis.call('INCR', KEYS[1]); if current == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; return current";

function getRedisUrl() {
  return process.env.REDIS_URL;
}

function getRedisDb(pathname: string) {
  const rawDb = pathname.replace(/^\/+/, "");

  if (!rawDb) {
    return null;
  }

  const db = Number(rawDb);

  if (!Number.isInteger(db) || db < 0) {
    throw new Error("REDIS_URL database must be a non-negative integer");
  }

  return String(db);
}

function getStableKeyPart(value: string) {
  return createHash("sha256").update(value).digest("base64url").slice(0, 32);
}

function encodeRedisCommand(args: string[]) {
  return Buffer.from(
    `*${args.length}\r\n${args.map((arg) => `$${Buffer.byteLength(arg)}\r\n${arg}\r\n`).join("")}`,
    "utf8",
  );
}

function findLineEnd(buffer: Buffer, offset: number) {
  for (let index = offset; index < buffer.length - 1; index += 1) {
    if (buffer[index] === 13 && buffer[index + 1] === 10) {
      return index;
    }
  }

  return -1;
}

function parseRedisReply(buffer: Buffer, offset: number): { reply: RedisReply; nextOffset: number } | null {
  if (offset >= buffer.length) {
    return null;
  }

  const type = String.fromCharCode(buffer[offset]);
  const lineEnd = findLineEnd(buffer, offset + 1);

  if (lineEnd < 0) {
    return null;
  }

  const line = buffer.toString("utf8", offset + 1, lineEnd);
  const nextLineOffset = lineEnd + 2;

  if (type === "+") {
    return { reply: line, nextOffset: nextLineOffset };
  }

  if (type === "-") {
    throw new Error(`Redis error: ${line}`);
  }

  if (type === ":") {
    return { reply: Number(line), nextOffset: nextLineOffset };
  }

  if (type === "$") {
    const length = Number(line);

    if (length < 0) {
      return { reply: null, nextOffset: nextLineOffset };
    }

    const valueEnd = nextLineOffset + length;

    if (buffer.length < valueEnd + 2) {
      return null;
    }

    return {
      reply: buffer.toString("utf8", nextLineOffset, valueEnd),
      nextOffset: valueEnd + 2,
    };
  }

  throw new Error("Unsupported Redis response");
}

async function sendRedisCommands(commands: string[][]) {
  const redisUrl = getRedisUrl();

  if (!redisUrl) {
    return null;
  }

  const url = new URL(redisUrl);

  if (url.protocol !== "redis:") {
    throw new Error("REDIS_URL must use redis://");
  }

  const setupCommands: string[][] = [];
  const password = decodeURIComponent(url.password);
  const username = decodeURIComponent(url.username);
  const db = getRedisDb(url.pathname);

  if (password) {
    setupCommands.push(username ? ["AUTH", username, password] : ["AUTH", password]);
  }

  if (db) {
    setupCommands.push(["SELECT", db]);
  }

  const allCommands = [...setupCommands, ...commands];
  const expectedReplies = allCommands.length;

  return new Promise<RedisReply[]>((resolve, reject) => {
    const socket: Socket = createConnection({
      host: url.hostname,
      port: Number(url.port || 6379),
    });
    const replies: RedisReply[] = [];
    let buffer = Buffer.alloc(0);
    let settled = false;

    function settle(error: Error | null, value?: RedisReply[]) {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();

      if (error) {
        reject(error);
        return;
      }

      resolve(value ?? []);
    }

    socket.setTimeout(redisTimeoutMs, () => {
      settle(new Error("Redis rate limit timed out"));
    });

    socket.on("error", (error) => {
      settle(error);
    });

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      try {
        let offset = 0;

        while (replies.length < expectedReplies) {
          const parsed = parseRedisReply(buffer, offset);

          if (!parsed) {
            break;
          }

          replies.push(parsed.reply);
          offset = parsed.nextOffset;
        }

        if (offset > 0) {
          buffer = buffer.subarray(offset);
        }

        if (replies.length === expectedReplies) {
          settle(null, replies.slice(setupCommands.length));
        }
      } catch (error) {
        settle(error instanceof Error ? error : new Error("Redis rate limit failed"));
      }
    });

    socket.on("connect", () => {
      socket.write(Buffer.concat(allCommands.map(encodeRedisCommand)));
    });
  });
}

async function checkRedisPolicy(policy: RateLimitPolicy) {
  const replies = await sendRedisCommands([
    ["EVAL", redisRateLimitScript, "1", policy.key, String(policy.windowSeconds)],
  ]);

  if (!replies) {
    return null;
  }

  const count = replies[0];

  if (typeof count !== "number") {
    throw new Error("Redis rate limit returned an invalid counter");
  }

  return {
    allowed: count <= policy.limit,
    retryAfterSeconds: policy.windowSeconds,
  };
}

async function checkPolicies(policies: RateLimitPolicy[]): Promise<RateLimitResult> {
  for (const policy of policies) {
    const result = await checkRedisPolicy(policy);

    if (result && !result.allowed) {
      return {
        allowed: false,
        policy: policy.name,
        retryAfterSeconds: result.retryAfterSeconds,
      };
    }
  }

  return { allowed: true };
}

export async function checkOtpRequestRateLimit(email: string, requesterKey: string): Promise<RateLimitResult> {
  const emailKey = getStableKeyPart(email.toLowerCase());
  const requesterKeyPart = getStableKeyPart(requesterKey);
  const pairKey = getStableKeyPart(`${requesterKey}:${email.toLowerCase()}`);

  try {
    return await checkPolicies([
      {
        name: "otp_request_pair_minute",
        key: `qdoc:rate:otp-request:pair:${pairKey}:60`,
        limit: 1,
        windowSeconds: 60,
      },
      {
        name: "otp_request_email_hour",
        key: `qdoc:rate:otp-request:email:${emailKey}:3600`,
        limit: 5,
        windowSeconds: 3600,
      },
      {
        name: "otp_request_email_day",
        key: `qdoc:rate:otp-request:email:${emailKey}:86400`,
        limit: 20,
        windowSeconds: 86400,
      },
      {
        name: "otp_request_ip_minute",
        key: `qdoc:rate:otp-request:ip:${requesterKeyPart}:60`,
        limit: 10,
        windowSeconds: 60,
      },
      {
        name: "otp_request_ip_hour",
        key: `qdoc:rate:otp-request:ip:${requesterKeyPart}:3600`,
        limit: 100,
        windowSeconds: 3600,
      },
    ]);
  } catch (error) {
    console.error("Redis OTP request rate limit unavailable", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return { allowed: true };
  }
}

export async function checkOtpVerifyRateLimit(email: string, requesterKey: string): Promise<RateLimitResult> {
  const emailKey = getStableKeyPart(email.toLowerCase());
  const requesterKeyPart = getStableKeyPart(requesterKey);
  const pairKey = getStableKeyPart(`${requesterKey}:${email.toLowerCase()}`);

  try {
    return await checkPolicies([
      {
        name: "otp_verify_pair_minute",
        key: `qdoc:rate:otp-verify:pair:${pairKey}:60`,
        limit: 5,
        windowSeconds: 60,
      },
      {
        name: "otp_verify_email_hour",
        key: `qdoc:rate:otp-verify:email:${emailKey}:3600`,
        limit: 30,
        windowSeconds: 3600,
      },
      {
        name: "otp_verify_ip_hour",
        key: `qdoc:rate:otp-verify:ip:${requesterKeyPart}:3600`,
        limit: 120,
        windowSeconds: 3600,
      },
    ]);
  } catch (error) {
    console.error("Redis OTP verify rate limit unavailable", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return { allowed: true };
  }
}
