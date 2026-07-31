import { NextResponse } from "next/server";
import { prisma } from "../../../lib/db";

export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

export async function GET() {
  const resumes = await prisma.resume.findMany({
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      label: true,
      track: true,
      fileName: true,
      mimeType: true,
      size: true,
      isDefault: true,
      createdAt: true,
      _count: { select: { applications: true } },
    },
  });
  return NextResponse.json({
    resumes: resumes.map((r) => ({ ...r, applicationCount: r._count.applications, _count: undefined })),
  });
}

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  const label = String(form.get("label") ?? "").trim();
  const track = String(form.get("track") ?? "any");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "That file is empty" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Resume must be under 8 MB" }, { status: 400 });
  }
  if (file.type && !ALLOWED.includes(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type "${file.type}". Use PDF, DOC, DOCX or TXT.` },
      { status: 400 },
    );
  }
  if (!["ai", "fde", "any"].includes(track)) {
    return NextResponse.json({ error: "track must be ai, fde or any" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  const resume = await prisma.$transaction(async (tx) => {
    const created = await tx.resume.create({
      data: {
        label: label || file.name.replace(/\.[^.]+$/, ""),
        track,
        fileName: file.name,
        mimeType: file.type || "application/pdf",
        size: bytes.length,
        data: bytes,
        isDefault: true,
      },
      select: { id: true, label: true, track: true, fileName: true, size: true, isDefault: true },
    });
    // A newly uploaded resume becomes the default for its track.
    await tx.resume.updateMany({
      where: { track, isDefault: true, id: { not: created.id } },
      data: { isDefault: false },
    });
    return created;
  });

  return NextResponse.json({ resume }, { status: 201 });
}
