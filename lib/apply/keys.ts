/**
 * Direct API submission to Greenhouse and Lever requires a per-employer key
 * that only the employer can issue — there is no public "apply" endpoint. When
 * you happen to have one (some companies hand them to agencies and referral
 * partners), drop it in the env and this app will submit server-side instead of
 * driving a browser.
 *
 *   GREENHOUSE_BOARD_KEYS='{"anthropic":"<job board api key>"}'
 *   LEVER_APPLY_KEYS='{"palantir":"<posting api key>"}'
 *
 * Anything without a key falls back to browser automation, which needs no
 * credentials at all.
 */
function parseKeyMap(raw?: string): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    console.warn("Ignoring malformed ATS key map in env");
    return {};
  }
}

export function greenhouseKeys() {
  return parseKeyMap(process.env.GREENHOUSE_BOARD_KEYS);
}

export function leverKeys() {
  return parseKeyMap(process.env.LEVER_APPLY_KEYS);
}

export type ApplyMethod = "greenhouse_api" | "lever_api" | "assisted";

/** Which submission path a posting supports, decided at ingest time. */
export function resolveApplyMethod(source: string, boardKey: string): ApplyMethod {
  if (source === "greenhouse" && greenhouseKeys()[boardKey]) return "greenhouse_api";
  if (source === "lever" && leverKeys()[boardKey]) return "lever_api";
  return "assisted";
}
