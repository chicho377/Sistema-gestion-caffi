import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const cookieName = "sigca-password-flow";
function signature(payload: string) {
  const secret = process.env.AUTH_FLOW_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("AUTH_FLOW_SECRET no configurado.");
  return createHmac("sha256", secret).update(payload).digest("hex");
}
export async function allowPasswordChange(userId: string) {
  const payload = Buffer.from(
    JSON.stringify({ userId, expires: Date.now() + 15 * 60_000 }),
  ).toString("base64url");
  (await cookies()).set(cookieName, `${payload}.${signature(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 900,
  });
}
export async function canChangePassword(userId: string) {
  try {
    const value = (await cookies()).get(cookieName)?.value;
    if (!value) return false;
    const [payload, mac] = value.split(".");
    const expected = Buffer.from(signature(payload));
    const actual = Buffer.from(mac || "");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return false;
    const grant = JSON.parse(Buffer.from(payload, "base64url").toString());
    return grant.userId === userId && grant.expires > Date.now();
  } catch {
    return false;
  }
}
export async function clearPasswordChange() {
  (await cookies()).delete(cookieName);
}
