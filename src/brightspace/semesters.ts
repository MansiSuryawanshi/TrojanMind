import type { Course } from './brightspaceContext';
import { SEMESTER_TERMS, type SemesterTerm } from '../config/semesterTerms';

export type SectionKey = 'current' | 'upcoming' | 'past' | 'unconfirmed' | 'other';

export interface SemesterGroup {
  /** Stable key for React. */
  key: string;
  /** Semester label shown on the group and on each card. */
  label: string;
  courses: Course[];
}

export interface CourseSection {
  key: SectionKey;
  title: string;
  groups: SemesterGroup[];
}

const SECTION_TITLES: Record<SectionKey, string> = {
  current: 'Current Semester',
  upcoming: 'Upcoming Semesters',
  past: 'Past Semesters',
  unconfirmed: 'Awaiting Term Confirmation',
  other: 'Other Courses',
};

const SECTION_ORDER: SectionKey[] = ['current', 'upcoming', 'past', 'unconfirmed', 'other'];

/** 5-digit term prefix at the start of the code (preferred) or name, e.g. "20263_30130" / "20263 CSCI-561". */
export function termPrefix(course: Course): string | null {
  for (const s of [course.code, course.name]) {
    const m = s ? /^(\d{5})(?=[\s_-]|$)/.exec(s.trim()) : null;
    if (m) return m[1];
  }
  return null;
}

/** Local YYYY-MM-DD for comparison with configured term dates. */
function localDateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function classify(term: SemesterTerm, today: string): 'current' | 'upcoming' | 'past' {
  if (today < term.start) return 'upcoming';
  if (today > term.end) return 'past';
  return 'current';
}

const byName = (a: Course, b: Course) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });

/**
 * Group courses into semester sections. Every course appears exactly once.
 * Only confirmed terms are classified by date; nothing is inferred from
 * isActive or enrollment start/end dates.
 */
export function groupCoursesBySemester(courses: Course[], now: Date = new Date(), terms: SemesterTerm[] = SEMESTER_TERMS): CourseSection[] {
  const today = localDateKey(now);
  const termByCode = new Map(terms.map((t) => [t.code, t]));
  const buckets = new Map<SectionKey, Map<string, { group: SemesterGroup; term: SemesterTerm | null }>>();

  const add = (section: SectionKey, key: string, label: string, term: SemesterTerm | null, course: Course) => {
    let sec = buckets.get(section);
    if (!sec) buckets.set(section, (sec = new Map()));
    let entry = sec.get(key);
    if (!entry) sec.set(key, (entry = { group: { key, label, courses: [] }, term }));
    entry.group.courses.push(course);
  };

  for (const c of courses) {
    const prefix = termPrefix(c);
    const term = prefix ? termByCode.get(prefix) : undefined;
    if (term?.confirmed) {
      add(classify(term, today), term.code, term.label, term, c);
    } else if (prefix) {
      // Don't display a proposed label until it's confirmed.
      add('unconfirmed', prefix, term ? `Term ${prefix} (unconfirmed)` : `Term ${prefix} (not mapped)`, null, c);
    } else {
      add('other', 'other', 'No term', null, c);
    }
  }

  return SECTION_ORDER.flatMap((key) => {
    const sec = buckets.get(key);
    if (!sec) return [];
    const entries = [...sec.values()];
    entries.sort((a, b) => {
      if (a.term && b.term) {
        // Past: newest first. Current/upcoming: soonest first.
        return key === 'past' ? b.term.start.localeCompare(a.term.start) : a.term.start.localeCompare(b.term.start);
      }
      return b.group.key.localeCompare(a.group.key); // unconfirmed prefixes: higher code first
    });
    for (const e of entries) e.group.courses.sort(byName);
    return [{ key, title: SECTION_TITLES[key], groups: entries.map((e) => e.group) }];
  });
}
