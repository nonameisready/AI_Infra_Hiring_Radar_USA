import { NextResponse } from "next/server";
import { prisma } from "../../../lib/db";
import { getProfile } from "../../../lib/apply";

export const dynamic = "force-dynamic";

const STRING_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "location",
  "linkedin",
  "github",
  "website",
  "workAuth",
  "gender",
  "race",
  "veteran",
  "disability",
  "coverLetter",
] as const;

export async function GET() {
  return NextResponse.json({ profile: await getProfile() });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  for (const key of STRING_FIELDS) {
    if (typeof body[key] === "string") data[key] = body[key].slice(0, key === "coverLetter" ? 8000 : 300);
  }
  if (typeof body.needsSponsor === "boolean") data.needsSponsor = body.needsSponsor;
  if (typeof body.usAuthorized === "boolean") data.usAuthorized = body.usAuthorized;

  if (body.customAnswers !== undefined) {
    // Stored as a JSON string of [{ match, value }] used by the autofiller.
    const list = Array.isArray(body.customAnswers) ? body.customAnswers : [];
    data.customAnswers = JSON.stringify(
      list
        .filter((c: any) => c && typeof c.match === "string" && typeof c.value === "string")
        .map((c: any) => ({ match: c.match.slice(0, 200), value: c.value.slice(0, 1000) }))
        .slice(0, 50),
    );
  }

  const profile = await prisma.profile.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });

  return NextResponse.json({ profile });
}
