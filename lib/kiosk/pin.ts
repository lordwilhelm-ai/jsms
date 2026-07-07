import bcrypt from "bcryptjs";

/**
 * Compare a plaintext PIN entered on the kiosk keypad against a bcrypt
 * hash pulled from the teacher's cached record.
 */
export async function comparePin(enteredPin: string, pinHash: string | null | undefined): Promise<boolean> {
  if (!pinHash) return false;

  try {
    return await bcrypt.compare(enteredPin, pinHash);
  } catch {
    return false;
  }
}

/**
 * Hash a plaintext PIN. Not used by the kiosk screen itself, but handy
 * for admin tooling / seed scripts that provision teacher PINs.
 */
export async function hashPin(plainPin: string, saltRounds = 10): Promise<string> {
  return bcrypt.hash(plainPin, saltRounds);
}
