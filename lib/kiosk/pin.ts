import bcrypt from "bcryptjs";

/**
 * Compare a plaintext PIN entered on the kiosk keypad
 * against the bcrypt hash stored in the cached teacher record.
 */
export async function comparePin(
  enteredPin: string,
  pinHash: string | null | undefined
): Promise<boolean> {
  if (!enteredPin || !pinHash) return false;

  try {
    return await bcrypt.compare(enteredPin.trim(), pinHash);
  } catch (error) {
    console.error("PIN comparison failed:", error);
    return false;
  }
}

/**
 * Hash a plaintext PIN.
 * Used when creating or updating teacher PINs from admin tools.
 */
export async function hashPin(
  plainPin: string,
  saltRounds = 10
): Promise<string> {
  if (!plainPin) {
    throw new Error("PIN cannot be empty");
  }

  return bcrypt.hash(plainPin.trim(), saltRounds);
}

/**
 * Validate PIN format before hashing/comparing.
 * Kiosk uses 4-digit teacher PINs.
 */
export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}