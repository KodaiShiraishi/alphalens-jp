import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  clearSessionCookie,
  getUserBySessionToken,
  loginUser,
  logoutSession,
  registerUser,
  setCsrfCookie,
  setSessionCookie
} from "../services/authService.js";
import { sessionCookieName } from "../config/env.js";

const authSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8)
});

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.get("/auth/csrf", async (_request, reply) => {
    const csrfToken = setCsrfCookie(reply);
    return { csrfToken };
  });

  app.post("/auth/register", async (request, reply) => {
    const input = authSchema.parse(request.body);
    const { user, sessionToken } = await registerUser(input.email, input.password);
    setSessionCookie(reply, sessionToken);
    setCsrfCookie(reply);
    return { user };
  });

  app.post("/auth/login", async (request, reply) => {
    const input = authSchema.parse(request.body);
    const { user, sessionToken } = await loginUser(input.email, input.password);
    setSessionCookie(reply, sessionToken);
    setCsrfCookie(reply);
    return { user };
  });

  app.post("/auth/logout", async (request, reply) => {
    await logoutSession(request.cookies[sessionCookieName]);
    clearSessionCookie(reply);
    setCsrfCookie(reply);
    return { ok: true };
  });

  app.get("/auth/me", async (request) => {
    const user = await getUserBySessionToken(request.cookies[sessionCookieName]);
    return { user };
  });
};
