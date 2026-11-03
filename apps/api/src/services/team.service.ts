import { and, desc, eq, users } from "@hookrelay/db";
import type { UserDto } from "@hookrelay/shared";
import { AppError } from "../utils/app-error";
import { db } from "../utils/db";
import type { AuthContext } from "./auth.service";

export async function listUsers(tenantId: string): Promise<UserDto[]> {
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.tenantId, tenantId))
    .orderBy(desc(users.createdAt), desc(users.id));
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

/**
 * The owner removes a member, or a member removes themselves (leave). Their sessions stop working at once
 * because auth.middleware loads the user row on every request.
 */
export async function removeUser(auth: AuthContext, targetUserId: string): Promise<void> {
  const [target] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(and(eq(users.id, targetUserId), eq(users.tenantId, auth.tenantId)));
  if (!target) throw new AppError(404, "not_found", "User not found");
  if (auth.role !== "owner" && auth.userId !== target.id) {
    throw new AppError(403, "forbidden", "Members can only remove themselves");
  }
  if (target.role === "owner") throw new AppError(409, "conflict", "The owner cannot be removed");

  await db.delete(users).where(and(eq(users.id, target.id), eq(users.tenantId, auth.tenantId)));
}
