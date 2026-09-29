// Official reports as ingest/official writes them and pipeline.py merges
// them into each pass file. The words are the agency's. Snowline quotes,
// attributes and links them, and derives nothing from them on the client
// except how long ago the agency dated each one.

export interface OfficialReport {
  /** Who published it, such as "National Park Service". */
  agency: string;
  /** The park, forest or road system that wrote it. */
  unit: string;
  /** The agency's own grouping on its page; may be empty. */
  section: string;
  /** The place the agency named, in its words. */
  place: string;
  /** The report as published. Lines are separated by a newline. */
  text: string;
  /** True when `text` is the opening of a longer report, cut at the end of a sentence. */
  truncated: boolean;
  /** The date the agency gave, YYYY-MM-DD. Every report has one. */
  date: string;
  /** Where to read it at the source. */
  url: string;
  /** When Snowline fetched this copy, ISO, UTC. */
  fetched_at: string;
  /** Whether the agency named the pass where it names the place, or in the report's words. */
  named_in: "place" | "text";
}

export interface Official {
  reports: OfficialReport[];
  issued_for: string;
  fetched_at: string | null;
}
