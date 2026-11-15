/**
 * Semester term mapping for Brightspace course codes.
 *
 * Brightspace (via the local connector) returns no semester metadata: course
 * codes/names only carry a 5-digit prefix such as `20262` or `20263`. That
 * prefix's meaning is NOT inferred in code — it comes only from this table.
 *
 * An entry is used to label a course Current / Upcoming / Past only when
 * `confirmed` is true. Unconfirmed or unknown prefixes are shown under
 * "Awaiting term confirmation" and never classified by date.
 *
 * Dates are inclusive calendar dates (YYYY-MM-DD, local time). The current
 * semester is derived from these dates and today's date at render time.
 */
export interface SemesterTerm {
  /** 5-digit prefix exactly as it appears in course codes/names. */
  code: string;
  /** Display name, e.g. "Fall 2026". */
  label: string;
  /** First day of the term (YYYY-MM-DD). */
  start: string;
  /** Last day of the term (YYYY-MM-DD). */
  end: string;
  /** Set to true only after the label and dates have been verified. */
  confirmed: boolean;
}

// Labels use Brightspace's own semester names (My Courses widget tabs:
// "2025 Fall", "2026 Spring", "2026 Summer", "2026 Fall").
// Dates: USC academic calendar (usc.edu/academic-calendar, arr.usc.edu).
export const SEMESTER_TERMS: SemesterTerm[] = [
  // Brightspace's "2026 Summer" tab was not checked directly. The code follows
  // USC's term-code pattern (classes.usc.edu/term-YYYYT; 1 = Spring, 2 = Summer, 3 = Fall).
  // Start date is the earliest summer session found (May 18). End date is the session-735 end
  // (Aug 15) from a Social Work school calendar; the main-campus summer end date wasn't confirmed.
  { code: '20262', label: '2026 Summer', start: '2026-05-18', end: '2026-08-15', confirmed: true },
  // Verified: both 20263 courses appear under Brightspace's "2026 Fall" tab.
  // Classes begin Aug 24; final exams end Dec 16.
  { code: '20263', label: '2026 Fall', start: '2026-08-24', end: '2026-12-16', confirmed: true },
];
