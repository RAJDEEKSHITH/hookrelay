import { and, desc, eq, invitations, isNull, sql, tenants, users, type Tx } from "@hookrelay/db";
import { INVITATION_TTL_DAYS, MAX_USERS_PER_TENANT, type InvitationDto } from "@hookrelay/shared";
import { randomToken, sha256Hex } from "@hookrelay/webhook-core";
import { env } from "../config/env";
import { AppError } from "../utils/app-error";
import { db, isUniqueViolation } from "../utils/db";
import { hashPassword } from "../utils/password";
import type { AcceptInvitationInput } from "../validators/invitations.validator";
import { startSession, type AuthContext, type LoginResult } from "./auth.service";

const dtoColumns = {
  id: invitations.id,
  email: invitations.email,
  invitedBy: invitations.invitedBy,
  expiresAt: invitations.expiresAt,
  createdAt: invitations.createdAt,
};

function toDto(row: { id: string; email: string; invitedBy: string | null; expiresAt: Date; createdAt: Date }): InvitationDto {
  return { ...row, expiresAt: row.expiresAt.toISOString(), createdAt: row.createdAt.toISOString() };
}

/** Not accepted, not revoked, not expired: these hold a seat in the team. */
const isOpen = and(isNull(invitations.acceptedAt), isNull(invitations.revokedAt), sql`${invitations.expiresAt} > now()`);

async function countSeats(tx: Tx, tenantId: string): Promise<number> {
  const [userCount] = await tx
    .select({ value: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.tenantId, tenantId));
  const [inviteCount] = await tx
    .select({ value: sql<number>`count(*)::int` })
    .from(invitations)
    .where(and(eq(invitations.tenantId, tenantId), isOpen));
  return (userCount?.value ?? 0) + (inviteCount?.value ?? 0);
}

export async function listInvitations(tenantId: string): Promise<InvitationDto[]> {
  const rows = await db
    .select(dtoColumns)
    .from(invitations)
    .where(and(eq(invitations.tenantId, tenantId), isOpen))
    .orderBy(desc(invitations.createdAt), desc(invitations.id));
  return rows.map(toDto);
}

/** Returns the invitation with its one-time accept link; only the token's hash is stored. */
export async function createInvitation(auth: AuthContext, email: string): Promise<InvitationDto> {
  const token = randomToken(32);
  const row = await db.transaction(async (tx) => {
    // Serialises invites per tenant, so two simultaneous invites cannot both pass the seat check.
    await tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, auth.tenantId)).for("update");

    const [existingUser] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (existingUser) throw new AppError(409, "conflict", "This email already belongs to a user");

    // Resend: retire every earlier invitation for this email, expired ones too. The partial unique index
    // invitations_open_email_uq cannot use now(), so an expired but unrevoked row would still block the insert.
    await tx
      .update(invitations)
      .set({ revokedAt: sql`now()` })
      .where(
        and(
          eq(invitations.tenantId, auth.tenantId),
          eq(invitations.email, email),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
        ),
      );

    if ((await countSeats(tx, auth.tenantId)) >= MAX_USERS_PER_TENANT) {
      throw new AppError(
        409,
        "limit_reached",
        `A team has at most ${MAX_USERS_PER_TENANT} users, counting open invitations`,
      );
    }

    const [inserted] = await tx
      .insert(invitations)
      .values({
        tenantId: auth.tenantId,
        invitedBy: auth.userId,
        email,
        tokenHash: sha256Hex(token),
        expiresAt: sql`now() + make_interval(days => ${INVITATION_TTL_DAYS})`,
      })
      .returning(dtoColumns);
    if (!inserted) throw new Error("invitation insert returned no row");
    return inserted;
  });
  return { ...toDto(row), link: `${env.DASHBOARD_URL}/accept-invite?token=${token}` };
}

/** Revoking an already revoked invitation is a no-op; an accepted one cannot be revoked. */
export async function revokeInvitation(tenantId: string, invitationId: string): Promise<void> {
  const scope = and(eq(invitations.id, invitationId), eq(invitations.tenantId, tenantId));
  const [revoked] = await db
    .update(invitations)
    .set({ revokedAt: sql`now()` })
    .where(and(scope, isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
    .returning({ id: invitations.id });
  if (revoked) return;

  const [existing] = await db.select({ acceptedAt: invitations.acceptedAt }).from(invitations).where(scope);
  if (!existing) throw new AppError(404, "not_found", "Invitation not found");
  if (existing.acceptedAt) throw new AppError(409, "conflict", "This invitation has already been accepted");
}

export async function acceptInvitation(input: AcceptInvitationInput): Promise<LoginResult> {
  const passwordHash = await hashPassword(input.password);
  let userId: string;
  try {
    userId = await db.transaction(async (tx) => {
      // FOR UPDATE: a second accept of the same token waits here, then no longer matches isOpen.
      const [invitation] = await tx
        .select({ id: invitations.id, tenantId: invitations.tenantId, email: invitations.email })
        .from(invitations)
        .where(and(eq(invitations.tokenHash, sha256Hex(input.token)), isOpen))
        .for("update");
      if (!invitation) throw new AppError(409, "conflict", "This invitation is invalid, expired or already used");

      const [user] = await tx
        .insert(users)
        .values({
          tenantId: invitation.tenantId,
          email: invitation.email,
          name: input.name,
          passwordHash,
          role: "member",
        })
        .returning({ id: users.id });
      if (!user) throw new Error("user insert returned no row");
      await tx.update(invitations).set({ acceptedAt: sql`now()` }).where(eq(invitations.id, invitation.id));
      return user.id;
    });
  } catch (err) {
    // Someone registered this email after the invitation was sent.
    if (isUniqueViolation(err, "users_email_uq")) {
      throw new AppError(409, "conflict", "This email is already registered");
    }
    throw err;
  }
  return startSession(userId);
}
