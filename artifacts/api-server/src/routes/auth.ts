import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { usersTable, tenantsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import {
  requireAuth,
  verifyPassword,
  createSession,
  deleteSession,
  SESSION_COOKIE,
} from "../lib/auth.js";
import { createAuditLog } from "../lib/audit.js";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Helper to build user response
async function buildUserResponse(user: typeof usersTable.$inferSelect) {
  let tenantName: string | null = null;
  let tenantSlug: string | null = null;
  if (user.tenantId) {
    const tenants = await db
      .select({ name: tenantsTable.name, slug: tenantsTable.slug })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, user.tenantId))
      .limit(1);
    tenantName = tenants[0]?.name ?? null;
    tenantSlug = tenants[0]?.slug ?? null;
  }
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    tenantId: user.tenantId ?? null,
    tenantName,
    tenantSlug,
    active: user.active,
    createdAt: user.createdAt,
  };
}

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ValidationError", message: "Datos de solicitud no válidos" });
    return;
  }
  const { email, password } = parsed.data;

  const users = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()))
    .limit(1);

  const user = users[0];
  if (!user || !user.active) {
    res.status(401).json({ error: "Unauthorized", message: "Credenciales incorrectas" });
    return;
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Unauthorized", message: "Credenciales incorrectas" });
    return;
  }

  await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));

  const sessionToken = await createSession(user.id);

  res.cookie(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  await createAuditLog({
    action: "login",
    entityType: "user",
    entityId: user.id,
    userId: user.id,
    tenantId: user.tenantId,
  });

  res.json(await buildUserResponse(user));
});

router.post("/logout", requireAuth, async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) {
    await deleteSession(token);
  }
  res.clearCookie(SESSION_COOKIE);
  res.json({ message: "Sesión cerrada" });
});

router.get("/me", requireAuth, async (req, res) => {
  const authUser = (req as any).user;
  const users = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, authUser.userId))
    .limit(1);

  const user = users[0];
  if (!user) {
    res.status(401).json({ error: "Unauthorized", message: "Usuario no encontrado" });
    return;
  }

  res.json(await buildUserResponse(user));
});

// ─── Microsoft OAuth ──────────────────────────────────────────────────────────

router.get("/microsoft", (req, res) => {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const tenantId = process.env.MICROSOFT_TENANT_ID || "common";
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI ||
    `${req.protocol}://${req.headers.host}/api/auth/microsoft/callback`;

  if (!clientId) {
    res.status(503).json({
      error: "NotConfigured",
      message: "Microsoft OAuth no está configurado. Añade MICROSOFT_CLIENT_ID y MICROSOFT_CLIENT_SECRET como variables de entorno.",
    });
    return;
  }

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: "openid profile email User.Read",
    state: "helpdesk_ms_login",
  });

  res.redirect(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params}`);
});

router.get("/microsoft/callback", async (req, res) => {
  const { code, error: oauthError } = req.query as Record<string, string>;
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const tenantId = process.env.MICROSOFT_TENANT_ID || "common";
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI ||
    `${req.protocol}://${req.headers.host}/api/auth/microsoft/callback`;
  const frontendUrl = process.env.FRONTEND_URL || "/";

  if (oauthError || !code) {
    res.redirect(`${frontendUrl}?error=microsoft_auth_failed`);
    return;
  }

  if (!clientId || !clientSecret) {
    res.redirect(`${frontendUrl}?error=microsoft_not_configured`);
    return;
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      }
    );

    const tokenData = await tokenRes.json() as any;
    if (!tokenData.access_token) {
      res.redirect(`${frontendUrl}?error=token_exchange_failed`);
      return;
    }

    // Get Microsoft user profile
    const profileRes = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json() as any;

    const email = (profile.mail || profile.userPrincipalName || "").toLowerCase();
    const name = profile.displayName || email.split("@")[0];

    if (!email) {
      res.redirect(`${frontendUrl}?error=no_email`);
      return;
    }

    // Find or create user
    let existingUsers = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    let user = existingUsers[0];

    if (!user) {
      // Auto-create as usuario_cliente (no tenant) — admin can assign later
      const created = await db
        .insert(usersTable)
        .values({
          email,
          name,
          passwordHash: "",
          role: "usuario_cliente",
          tenantId: null,
          active: true,
        })
        .returning();
      user = created[0];
    }

    if (!user.active) {
      res.redirect(`${frontendUrl}?error=account_inactive`);
      return;
    }

    await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));

    const sessionToken = await createSession(user.id);
    res.cookie(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    await createAuditLog({
      action: "login_microsoft",
      entityType: "user",
      entityId: user.id,
      userId: user.id,
      tenantId: user.tenantId,
    });

    res.redirect(`${frontendUrl}dashboard`);
  } catch (err) {
    console.error("Microsoft OAuth error:", err);
    res.redirect(`${frontendUrl}?error=server_error`);
  }
});

export default router;
