// Every request the report feature makes. The list is read straight from
// the public view; filing goes through the file-report function; removing
// is a delete that row level security keeps to the person's own rows.
import { backend } from "./backend";
import { tapsOf } from "./reports";
import {
  type FiledReport,
  type PassReport,
  PHOTO_BUCKET,
  type PreparedPhoto,
  type ReportDraft,
} from "./reportTypes";

export class ReportError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// Named one by one: the view has no user id to ask for, and asking for
// exactly these keeps it that way if the view ever grows.
const COLUMNS = [
  "id",
  "pass_slug",
  "date_observed",
  "snow_condition",
  "traction_used",
  "crossing_condition",
  "exposure_comfort",
  "larches",
  "wildflowers",
  "mosquitoes",
  "water_status",
  "water_source",
  "body",
  "quote_span",
  "photo_path",
  "status",
  "tapped",
  "created_at",
  "mine",
].join(",");

const LIST_LIMIT = 100;
const PHOTO_URL_SECONDS = 3600;

export async function loadReports(slug: string, until: string): Promise<PassReport[]> {
  const { data, error } = await backend()
    .from("pass_reports")
    .select(COLUMNS)
    .eq("pass_slug", slug)
    .lte("date_observed", until)
    .order("date_observed", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (error) throw new ReportError("Reports could not be loaded just now.", error.code ?? "load", 0);
  return (data ?? []) as unknown as PassReport[];
}

/** Short-lived addresses for the photos of reports the reader can see. A
 * photo that cannot be signed is left out; its report still shows. */
export async function signPhotos(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await backend().storage.from(PHOTO_BUCKET).createSignedUrls(paths, PHOTO_URL_SECONDS);
  if (error || !data) return {};
  const urls: Record<string, string> = {};
  for (const item of data) {
    if (item.path && item.signedUrl && !item.error) urls[item.path] = item.signedUrl;
  }
  return urls;
}

function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (n) => n.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Uploads the prepared photo into the person's own folder, which only
 * they can read. The function publishes it from there. */
export async function uploadPhoto(photo: PreparedPhoto, userId: string): Promise<string> {
  const path = `${userId}/${newId()}.jpg`;
  const { error } = await backend()
    .storage.from(PHOTO_BUCKET)
    .upload(path, photo.blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw new ReportError("The photo could not be uploaded. The report was not published.", "photo_upload", 0);
  return path;
}

export async function discardUpload(path: string): Promise<void> {
  await backend()
    .storage.from(PHOTO_BUCKET)
    .remove([path])
    .catch(() => {});
}

export async function fileReport(slug: string, draft: ReportDraft, photoPath: string | null): Promise<FiledReport> {
  const { data, error } = await backend().functions.invoke<FiledReport>("file-report", {
    body: { slug, date: draft.date, text: draft.text.trim(), taps: tapsOf(draft), photo_path: photoPath },
  });
  if (error) {
    // A refusal from the function carries its own sentence for the reader.
    const response = (error as { context?: Response }).context;
    if (response && typeof response.json === "function") {
      const body = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
      throw new ReportError(
        body?.error ?? "The report could not be sent. Nothing was published.",
        body?.code ?? "unknown",
        response.status,
      );
    }
    throw new ReportError("The report could not be sent. Check your connection. Nothing was published.", "network", 0);
  }
  if (!data?.report) throw new ReportError("No reply came back. Check the list before filing again.", "no_reply", 0);
  return data;
}

export async function removeReport(report: PassReport): Promise<void> {
  if (report.photo_path) {
    // The photo goes first, while the report still says whose it is. If
    // this fails the row is still removed, and a photo with no visible
    // report cannot be read by anyone.
    await backend()
      .storage.from(PHOTO_BUCKET)
      .remove([report.photo_path])
      .catch(() => {});
  }
  const { error, count } = await backend().from("reports").delete({ count: "exact" }).eq("id", report.id);
  if (error || count === 0) {
    throw new ReportError("The report could not be removed just now.", error?.code ?? "not_removed", 0);
  }
}
