import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/db";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/** Download / preview the stored file. */
export async function GET(_req: Request, { params }: Ctx) {
  const resume = await prisma.resume.findUnique({ where: { id: params.id } });
  if (!resume) return NextResponse.json({ error: "not found" }, { status: 404 });

  return new NextResponse(new Uint8Array(resume.data), {
    headers: {
      "Content-Type": resume.mimeType,
      "Content-Disposition": `inline; filename="${resume.fileName.replace(/"/g, "")}"`,
      "Content-Length": String(resume.size),
      "Cache-Control": "private, no-store",
    },
  });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (typeof body.label === "string" && body.label.trim()) data.label = body.label.trim();
  if (typeof body.track === "string" && ["ai", "fde", "any"].includes(body.track)) data.track = body.track;

  const existing = await prisma.resume.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const resume = await prisma.$transaction(async (tx) => {
    const updated = await tx.resume.update({
      where: { id: params.id },
      data: { ...data, ...(body.isDefault === true ? { isDefault: true } : {}) },
      select: { id: true, label: true, track: true, fileName: true, size: true, isDefault: true },
    });
    if (body.isDefault === true) {
      await tx.resume.updateMany({
        where: { track: updated.track, isDefault: true, id: { not: updated.id } },
        data: { isDefault: false },
      });
    }
    return updated;
  });

  return NextResponse.json({ resume });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  await prisma.resume.delete({ where: { id: params.id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
