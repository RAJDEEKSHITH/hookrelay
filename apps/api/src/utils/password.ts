import bcrypt from "bcrypt";

const BCRYPT_COST = 12;

// A cost-12 hash of a throwaway password. Login with an unknown email compares against it, so that request
// takes as long as a wrong password and response time does not reveal which emails are registered.
const DUMMY_HASH = "$2b$12$gOWHpnuqEKv1LxMdMFo6oeHkh9EgsndMWkqzvMPZqL5312jwdpxTW";

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

/** Pass `null` for an unknown user: the comparison still runs (against the dummy hash) and returns false. */
export async function verifyPassword(password: string, hash: string | null): Promise<boolean> {
  const matches = await bcrypt.compare(password, hash ?? DUMMY_HASH);
  return hash !== null && matches;
}
