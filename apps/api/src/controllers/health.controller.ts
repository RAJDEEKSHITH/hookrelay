import type { Request, Response } from "express";
import { checkReadiness } from "../services/health.service";

// Health probes are exempt from the { data } envelope (§5 Response format).

export function healthz(_req: Request, res: Response): void {
  res.json({ status: "ok" });
}

export async function readyz(_req: Request, res: Response): Promise<void> {
  const checks = await checkReadiness();
  if (checks.postgres && checks.redis) {
    res.json({ status: "ok" });
    return;
  }
  res.status(503).json({ status: "unavailable", checks });
}
