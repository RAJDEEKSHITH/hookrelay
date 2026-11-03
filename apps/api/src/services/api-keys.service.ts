import { and, apiKeys, desc, eq, isNull, sql } from "@hookrelay/db";
import type { ApiKeyDto } from "@hookrelay/shared";
import { randomToken, sha256Hex } from "@hookrelay/webhook-core";
import { AppError } from "../utils/app-error";
import { db } from "../utils/db";
import type { AuthContext } from "./auth.service";

const KEY_PREFIX = "hr_live_";
const DISPLAY_PREFIX_LENGTH = 12;

const dtoColumns = {
  id: apiKeys.id,
  name: apiKeys.name,
  prefix: apiKeys.prefix,
  createdBy: apiKeys.createdBy,
  lastUsedAt: apiKeys.lastUsedAt,
  revokedAt: apiKeys.revokedAt,
  createdAt: apiKeys.createdAt,
};

function toDto(row: {
  id: string;
  name: string;
  prefix: string;
  createdBy: string | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}): ApiKeyDto {
  return {
    ...row,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listApiKeys(tenantId: string, limit: number): Promise<ApiKeyDto[]> {
  const rows = await db
    .select(dtoColumns)
    .from(apiKeys)
    .where(eq(apiKeys.tenantId, tenantId))
    .orderBy(desc(apiKeys.createdAt), desc(apiKeys.id))
    .limit(limit);
  return rows.map(toDto);
}

/** The full key is in this response only; the database keeps its SHA-256 and a display prefix. */
export async function createApiKey(auth: AuthContext, name: string): Promise<ApiKeyDto> {
  const key = `${KEY_PREFIX}${randomToken(32)}`;
  const [row] = await db
    .insert(apiKeys)
    .values({
      tenantId: auth.tenantId,
      createdBy: auth.userId,
      name,
      prefix: key.slice(0, DISPLAY_PREFIX_LENGTH),
      keyHash: sha256Hex(key),
    })
    .returning(dtoColumns);
  if (!row) throw new Error("api key insert returned no row");
  return { ...toDto(row), key };
}

/** Revoking an already revoked key is a no-op. */
export async function revokeApiKey(tenantId: string, apiKeyId: string): Promise<void> {
  const scope = and(eq(apiKeys.id, apiKeyId), eq(apiKeys.tenantId, tenantId));
  const [revoked] = await db
    .update(apiKeys)
    .set({ revokedAt: sql`now()` })
    .where(and(scope, isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id });
  if (revoked) return;
  const [existing] = await db.select({ id: apiKeys.id }).from(apiKeys).where(scope);
  if (!existing) throw new AppError(404, "not_found", "API key not found");
}

/** Resolves a raw key to its tenant, or null when it is unknown or revoked. */
export async function authenticateApiKey(key: string): Promise<{ apiKeyId: string; tenantId: string } | null> {
  const [row] = await db
    .select({ apiKeyId: apiKeys.id, tenantId: apiKeys.tenantId })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, sha256Hex(key)), isNull(apiKeys.revokedAt)));
  if (!row) return null;

  // At most one write per key per minute instead of one per ingested event.
  await db
    .update(apiKeys)
    .set({ lastUsedAt: sql`now()` })
    .where(
      and(
        eq(apiKeys.id, row.apiKeyId),
        sql`(${apiKeys.lastUsedAt} is null or ${apiKeys.lastUsedAt} < now() - interval '1 minute')`,
      ),
    );
  return row;
}
