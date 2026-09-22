import { getActiveProfile } from "@/lib/auth";
export async function GET() {
  const profile = await getActiveProfile();
  return Response.json(
    { active: !!profile },
    {
      status: profile ? 200 : 401,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
