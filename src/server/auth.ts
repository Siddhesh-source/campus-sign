import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { createAuthEndpoint, APIError } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { nextCookies } from "better-auth/next-js";
import { z } from "zod";
import { db } from "./db";
import { audit, type RequestMeta } from "./audit";
import { UserFacingError } from "./errors";
import { log } from "./log";

import { INSTITUTION_DOMAIN, devAuthEnabled, isInstitutionEmail, normalizeEmail } from "@/lib/identity";

export { INSTITUTION_DOMAIN, devAuthEnabled, isInstitutionEmail, normalizeEmail };

export function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => normalizeEmail(e))
      .filter(Boolean),
  );
}


export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/**
 * Dev-only sign-in: creates (or reuses) a verified @vit.edu user and a real
 * database session, so the rest of the app runs exactly as with Google.
 */
function devSignIn() {
  return {
    id: "campusign-dev-sign-in",
    endpoints: {
      devSignIn: createAuthEndpoint(
        "/dev/sign-in",
        {
          method: "POST",
          body: z.object({
            email: z.string().email(),
            name: z.string().min(1).max(80),
          }),
        },
        async (ctx) => {
          const email = normalizeEmail(ctx.body.email);
          if (!isInstitutionEmail(email)) {
            throw new APIError("FORBIDDEN", { message: `Only @${INSTITUTION_DOMAIN} accounts can sign in.` });
          }
          const existing = await ctx.context.internalAdapter.findUserByEmail(email);
          const user =
            existing?.user ??
            (await ctx.context.internalAdapter.createUser(
              { email, name: ctx.body.name.trim(), emailVerified: true },
              { method: "dev-sign-in" },
            ));
          const session = await ctx.context.internalAdapter.createSession(user.id);
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ ok: true });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}

const plugins: BetterAuthPlugin[] = [];
if (devAuthEnabled()) plugins.push(devSignIn());
plugins.push(nextCookies());

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  socialProviders: googleConfigured()
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          // Sent as a hint AND enforced against the verified `hd` claim.
          hd: INSTITUTION_DOMAIN,
          prompt: "select_account",
        },
      }
    : {},
  user: {
    additionalFields: {
      suspendedAt: { type: "date", required: false, input: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  onAPIError: { errorURL: "/denied" },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (!isInstitutionEmail(user.email) || !user.emailVerified) {
            await db.$transaction((tx) =>
              audit(tx, { actorEmail: user.email, action: "auth.denied", metadata: { reason: "not_institution_account" } }),
            );
            return false;
          }
          return { data: { ...user, email: normalizeEmail(user.email) } };
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          const user = await db.user.findUnique({ where: { id: session.userId }, select: { suspendedAt: true, email: true } });
          if (!user || user.suspendedAt || !isInstitutionEmail(user.email)) return false;
          return { data: session };
        },
        after: async (session) => {
          const user = await db.user.findUnique({ where: { id: session.userId }, select: { id: true, email: true } });
          if (!user) return;
          await db.$transaction((tx) =>
            audit(tx, {
              actor: user,
              action: "auth.sign_in",
              meta: { ip: session.ipAddress, userAgent: session.userAgent },
            }),
          );
        },
      },
    },
  },
  plugins,
});

// ── Current user / roles ──────────────────────────────────────────────────

export type Role = "STUDENT" | "FACULTY" | "ADMIN";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  image: string | null;
  role: Role;
  /** Status of this user's faculty access record, if any. */
  facultyStatus: "PENDING" | "APPROVED" | "REJECTED" | "REVOKED" | null;
};

/**
 * Resolve the signed-in user and their role from the database on every
 * request. Role is never read from the client or cached in the session.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user || user.suspendedAt || !isInstitutionEmail(user.email)) return null;

  const access = await db.facultyAccess.findUnique({ where: { email: user.email }, select: { status: true } });
  const role: Role = adminEmails().has(user.email)
    ? "ADMIN"
    : access?.status === "APPROVED"
      ? "FACULTY"
      : "STUDENT";

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    role,
    facultyStatus: access?.status ?? null,
  };
});

/** For pages: redirect when signed out or not allowed. */
export async function requirePageUser(...roles: Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (roles.length && !roles.includes(user.role)) redirect("/dashboard");
  return user;
}

/** For server actions: throw a user-facing error instead of redirecting. */
export async function requireActor(...roles: Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UserFacingError("UNAUTHENTICATED", "Your session ended. Sign in again.");
  if (roles.length && !roles.includes(user.role)) {
    log.warn({ userId: user.id, role: user.role, need: roles }, "forbidden action");
    throw new UserFacingError("FORBIDDEN", "You don't have permission to do that.");
  }
  return user;
}

export async function requestMeta(): Promise<RequestMeta> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return { ip: fwd || h.get("x-real-ip") || null, userAgent: h.get("user-agent") };
}
