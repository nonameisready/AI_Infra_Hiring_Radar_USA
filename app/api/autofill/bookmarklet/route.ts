import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getProfile } from "../../../../lib/apply";

export const dynamic = "force-dynamic";

let cachedRuntime: string | null = null;

/**
 * Read the runtime off disk, falling back to the public URL if the file was not
 * traced into the deployment bundle.
 */
async function autofillRuntime(req: Request) {
  if (cachedRuntime) return cachedRuntime;

  try {
    cachedRuntime = fs.readFileSync(path.join(process.cwd(), "public", "autofill.js"), "utf8");
    return cachedRuntime;
  } catch {
    const res = await fetch(new URL("/autofill.js", req.url), { cache: "no-store" });
    if (!res.ok) throw new Error("autofill.js is not available");
    cachedRuntime = await res.text();
    return cachedRuntime;
  }
}

/**
 * A zero-install fallback for the Chrome extension.
 *
 * Greenhouse and Ashby both send `connect-src 'self'`, so a bookmarklet cannot
 * fetch anything from this app once it is running on their page. The profile is
 * therefore baked into the bookmarklet itself, and the resume file is left for
 * you to attach by hand — browsers only let scripted file attachment happen
 * from the extension or the worker.
 */
export async function GET(req: Request) {
  const profile = await getProfile();
  const payload = {
    profile: {
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: profile.email,
      phone: profile.phone,
      location: profile.location,
      linkedin: profile.linkedin,
      github: profile.github,
      website: profile.website,
      workAuth: profile.workAuth,
      needsSponsor: profile.needsSponsor,
      usAuthorized: profile.usAuthorized,
      gender: profile.gender,
      race: profile.race,
      veteran: profile.veteran,
      disability: profile.disability,
      coverLetter: profile.coverLetter,
      customAnswers: profile.customAnswers,
    },
    resume: null,
  };

  const runtime = await autofillRuntime(req);
  const body = `(function(){${runtime};window.__radarAutofill(${JSON.stringify(
    payload,
  )},{submit:false}).then(function(r){var n=r.filled.length;var msg="AI Hiring Radar filled "+n+" field"+(n===1?"":"s")+".";if(r.fileInputs>0){msg+="\\n\\nAttach your resume manually — "+r.fileInputs+" file upload field"+(r.fileInputs===1?"":"s")+" on this page.";}if(r.skipped.length){msg+="\\n\\nCouldn't fill: "+r.skipped.slice(0,6).map(function(s){return s.label}).join(", ");}alert(msg);}).catch(function(e){alert("Autofill failed: "+e.message)})})()`;

  const bookmarklet = `javascript:${encodeURIComponent(body)}`;

  return NextResponse.json({
    bookmarklet,
    bytes: bookmarklet.length,
    note: "Drag this to your bookmarks bar. It fills text fields only; attach the resume yourself.",
  });
}
