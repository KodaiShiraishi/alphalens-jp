import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import type { FastifyReply } from "fastify";
import { db } from "../db/client.js";
import { sessions, users, type User } from "../db/schema.js";
import { secureCookies, sessionCookieName } from "../config/env.js";
import { randomToken, sha256 } from "../utils/crypto.js";
import { errors } from "../utils/errors.js";

export type PublicUser = {
  id: string;
  email: string;
};

const sessionMaxAgeSeconds = 60 * 60 * 24 * 14;

export async function registerUser(email: string, password: string): Promise<{ user: PublicUser; sessionToken: string }> {
  const existing = await findUserByEmail(email);
  if (existing) throw errors.validation("このメールアドレスは登録済みです。");
  const userId = randomUUID();
  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db
    .insert(users)
    .values({ id: userId, email: email.toLowerCase(), passwordHash })
    .returning();
  const sessionToken = await createSession(user.id);
  return { user: toPublicUser(user), sessionToken };
}

export async function loginUser(email: string, password: string): Promise<{ user: PublicUser; sessionToken: string }> {
  const user = await findUserByEmail(email);
  if (!user) throw errors.unauthorized();
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw errors.unauthorized();
  const sessionToken = await createSession(user.id);
  return { user: toPublicUser(user), sessionToken };
}

export async function logoutSession(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  await db.delete(sessions).where(eq(sessions.tokenHash, sha256(rawToken)));
}

export async function getUserBySessionToken(rawToken: string | undefined): Promise<PublicUser | null> {
  if (!rawToken) return null;
  const [row] = await db
    .select({
      id: users.id,
      email: users.email
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256(rawToken)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}

export async function requireUser(rawToken: string | undefined): Promise<PublicUser> {
  const user = await getUserBySessionToken(rawToken);
  if (!user) throw errors.unauthorized();
  return user;
}

export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(sessionCookieName, token, {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "lax",
    path: "/",
    maxAge: sessionMaxAgeSeconds
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(sessionCookieName, {
    path: "/"
  });
}

export function setCsrfCookie(reply: FastifyReply, token = randomToken(24)): string {
  reply.setCookie("al_csrf", token, {
    httpOnly: false,
    secure: secureCookies,
    sameSite: "lax",
    path: "/",
    maxAge: sessionMaxAgeSeconds
  });
  return token;
}

async function findUserByEmail(email: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  return user ?? null;
}

async function createSession(userId: string): Promise<string> {
  const rawToken = randomToken(32);
  await db.insert(sessions).values({
    id: randomUUID(),
    userId,
    tokenHash: sha256(rawToken),
    expiresAt: new Date(Date.now() + sessionMaxAgeSeconds * 1000)
  });
  return rawToken;
}

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email
  };
}
