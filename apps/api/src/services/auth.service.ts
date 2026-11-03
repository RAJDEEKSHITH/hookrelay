import { eq, tenants, users } from "@hookrelay/db";
import type { MeDto, UserRole } from "@hookrelay/shared";
import { AppError } from "../utils/app-error";
import { db, isUniqueViolation } from "../utils/db";
import { hashPassword, verifyPassword } from "../utils/password";
import type { LoginInput, RegisterInput } from "../validators/auth.validator";
import { createSession, deleteSession, getSessionUserId } from "./sessions.service";

export interface AuthContext {
  userId: string;
  tenantId: string;
  role: UserRole;
}

/** A new session plus the logged-in user's MeDto; the controller puts the id in the cookie. */
export interface LoginResult {
  sessionId: string;
  me: MeDto;
}

const invalidCredentials = () => new AppError(401, "unauthorized", "Invalid email or password");

export async function getMe(userId: string): Promise<MeDto> {
  const [row] = await db
    .select({
      userId: users.id,
      userName: users.name,
      email: users.email,
      role: users.role,
      userCreatedAt: users.createdAt,
      tenantId: tenants.id,
      tenantName: tenants.name,
      tenantCreatedAt: tenants.createdAt,
    })
    .from(users)
    .innerJoin(tenants, eq(tenants.id, users.tenantId))
    .where(eq(users.id, userId));
  if (!row) throw new AppError(401, "unauthorized", "Not logged in");
  return {
    user: {
      id: row.userId,
      name: row.userName,
      email: row.email,
      role: row.role,
      createdAt: row.userCreatedAt.toISOString(),
    },
    tenant: { id: row.tenantId, name: row.tenantName, createdAt: row.tenantCreatedAt.toISOString() },
  };
}

/** Logs a user in after register or invitation accept. */
export async function startSession(userId: string): Promise<LoginResult> {
  const sessionId = await createSession(userId);
  return { sessionId, me: await getMe(userId) };
}

export async function register(input: RegisterInput): Promise<LoginResult> {
  // bcrypt is slow on purpose; hashing before the transaction keeps it short.
  const passwordHash = await hashPassword(input.password);
  let userId: string;
  try {
    userId = await db.transaction(async (tx) => {
      const [tenant] = await tx.insert(tenants).values({ name: input.tenantName }).returning({ id: tenants.id });
      if (!tenant) throw new Error("tenant insert returned no row");
      const [user] = await tx
        .insert(users)
        .values({ tenantId: tenant.id, name: input.name, email: input.email, passwordHash, role: "owner" })
        .returning({ id: users.id });
      if (!user) throw new Error("user insert returned no row");
      return user.id;
    });
  } catch (err) {
    if (isUniqueViolation(err, "users_email_uq")) {
      throw new AppError(409, "conflict", "This email is already registered");
    }
    throw err;
  }
  return startSession(userId);
}

export async function login(input: LoginInput): Promise<LoginResult> {
  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, input.email));
  // verifyPassword runs bcrypt even when the user does not exist (see password.ts).
  if (!(await verifyPassword(input.password, user?.passwordHash ?? null)) || !user) throw invalidCredentials();
  return startSession(user.id);
}

export async function logout(sessionId: string): Promise<void> {
  await deleteSession(sessionId);
}

/**
 * Session -> user row on every request, so a removed user is logged out at once and the role is never stale.
 * Returns null (and drops the session) when either is gone.
 */
export async function authenticateSession(sessionId: string): Promise<AuthContext | null> {
  const userId = await getSessionUserId(sessionId);
  if (userId === null) return null;
  const [user] = await db
    .select({ userId: users.id, tenantId: users.tenantId, role: users.role })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) {
    await deleteSession(sessionId);
    return null;
  }
  return user;
}
