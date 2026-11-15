/**
 * Official USC final exam slots, worked out from:
 *  - the Registrar's published final examination schedule (rules below,
 *    transcribed from https://arr.usc.edu/final-exam-schedule/), and
 *  - the section's meeting days/times from USC's public Schedule of Classes
 *    (classes.usc.edu). Only a term code and course code are sent there.
 *
 * USC sets standard-session finals by a class's first weekly meeting day and
 * start time, with a list of course-specific exceptions.
 */

export interface ExamSlot {
  /** YYYY-MM-DD, Los Angeles time. */
  date: string;
  /** HH:MM, 24h, Los Angeles time. */
  start: string;
  end: string;
  /** Which row of the official schedule produced this slot. */
  rule: string;
}

interface Row { from: number; to: number; date: string; start: string; end: string; label: string }

interface FinalsTerm {
  termCode: string;
  label: string;
  sourceUrl: string;
  /** Final exam window, inclusive. */
  window: { first: string; last: string };
  mwf: Row[];
  tth: Row[];
  /** 10:00 TTh classes split by end time: ≤ 10:50 → `short`, later → `long`. */
  tth1000: { short: Omit<Row, 'from' | 'to'>; long: Omit<Row, 'from' | 'to'> };
  evening: { mw6: Slot; tth6: Slot; mw8: Slot; tth8: Slot };
  saturday: { morning: Slot; afternoon: Slot };
  /** Course codes (PREFIX-NUMBER[SUFFIX], upper case) with fixed slots. */
  exceptions: { courses: string[]; slot: Slot }[];
}

type Slot = { date: string; start: string; end: string };

const h = (hh: number, mm = 0) => hh * 60 + mm;

/** Fall 2026, transcribed from the Registrar's page. */
const FALL_2026: FinalsTerm = {
  termCode: '20263',
  label: 'Fall 2026',
  sourceUrl: 'https://arr.usc.edu/final-exam-schedule/',
  window: { first: '2026-12-09', last: '2026-12-16' },
  mwf: [
    { from: h(8), to: h(9), date: '2026-12-09', start: '08:00', end: '10:00', label: '8:00 or 8:30 AM MWF' },
    { from: h(9), to: h(10), date: '2026-12-14', start: '11:00', end: '13:00', label: '9:00 or 9:30 AM MWF' },
    { from: h(10), to: h(11), date: '2026-12-14', start: '08:00', end: '10:00', label: '10:00 or 10:30 AM MWF' },
    { from: h(11), to: h(12), date: '2026-12-09', start: '11:00', end: '13:00', label: '11:00 or 11:30 AM MWF' },
    { from: h(12), to: h(13), date: '2026-12-11', start: '11:00', end: '13:00', label: '12:00 or 12:30 PM MWF' },
    { from: h(13), to: h(14), date: '2026-12-16', start: '11:00', end: '13:00', label: '1:00 or 1:30 PM MWF' },
    { from: h(14), to: h(15), date: '2026-12-11', start: '14:00', end: '16:00', label: '2:00 or 2:30 PM MWF' },
    { from: h(15), to: h(16), date: '2026-12-14', start: '14:00', end: '16:00', label: '3:00 or 3:30 PM MWF' },
  ],
  tth: [
    { from: h(8), to: h(9), date: '2026-12-15', start: '16:30', end: '18:30', label: '8:00 or 8:30 AM TTh' },
    { from: h(9), to: h(10), date: '2026-12-10', start: '11:00', end: '13:00', label: '9:00 or 9:30 AM TTh' },
    { from: h(11), to: h(12), date: '2026-12-15', start: '08:00', end: '10:00', label: '11:00 or 11:30 AM TTh' },
    { from: h(12), to: h(13, 30), date: '2026-12-15', start: '11:00', end: '13:00', label: '12:00, 12:30 or 1:00 PM TTh' },
    { from: h(13, 30), to: h(15), date: '2026-12-10', start: '14:00', end: '16:00', label: '1:30, 2:00 or 2:30 PM TTh' },
    { from: h(15), to: h(16), date: '2026-12-15', start: '14:00', end: '16:00', label: '3:00 or 3:30 PM TTh' },
  ],
  tth1000: {
    short: { date: '2026-12-10', start: '11:00', end: '13:00', label: '10:00–10:50 AM TTh' },
    long: { date: '2026-12-15', start: '08:00', end: '10:00', label: '10:00–11:50 AM TTh' },
  },
  evening: {
    mw6: { date: '2026-12-09', start: '19:00', end: '21:00' },
    tth6: { date: '2026-12-10', start: '19:00', end: '21:00' },
    mw8: { date: '2026-12-14', start: '19:00', end: '21:00' },
    tth8: { date: '2026-12-15', start: '19:00', end: '21:00' },
  },
  saturday: {
    morning: { date: '2026-12-12', start: '10:00', end: '12:00' },
    afternoon: { date: '2026-12-12', start: '14:00', end: '16:00' },
  },
  exceptions: [
    { courses: ['ACCT-410', 'ACCT-451', 'MATH-118', 'MATH-125', 'MATH-126', 'MATH-129', 'MATH-226', 'MATH-229', 'PHYS-135B'], slot: { date: '2026-12-09', start: '14:00', end: '16:00' } },
    { courses: ['BUAD-311', 'BUAD-311T', 'BUAD-313', 'CHEM-105A', 'CHEM-107', 'CHEM-115A', 'CHEM-322A', 'CHEM-325A'], slot: { date: '2026-12-10', start: '08:00', end: '10:00' } },
    { courses: ['ACCT-416', 'BUAD-280', 'BUAD-305', 'CSCI-360', 'PHYS-135A', 'PHYS-152'], slot: { date: '2026-12-11', start: '08:00', end: '10:00' } },
    { courses: ['CSCI-102', 'CSCI-103', 'CSCI-104', 'CSCI-201', 'EALC-104', 'EALC-106', 'EALC-115', 'EALC-117', 'EALC-120', 'EALC-122', 'EALC-204', 'EALC-215', 'EALC-220'], slot: { date: '2026-12-12', start: '11:00', end: '13:00' } },
    { courses: ['BUAD-310', 'BUAD-312', 'BUAD-425', 'BUAD-427', 'DSO-587', 'EE-109'], slot: { date: '2026-12-12', start: '14:00', end: '16:00' } },
    { courses: ['CSCI-356', 'EE-457', 'GERM-101', 'GERM-102', 'GERM-201'], slot: { date: '2026-12-12', start: '16:30', end: '18:30' } },
    { courses: ['FREN-120', 'FREN-150', 'FREN-220', 'ITAL-120', 'ITAL-150', 'ITAL-175', 'ITAL-220'], slot: { date: '2026-12-12', start: '08:00', end: '10:00' } },
    { courses: ['SPAN-120', 'SPAN-150', 'SPAN-220', 'SPAN-240'], slot: { date: '2026-12-12', start: '12:00', end: '14:00' } },
    { courses: ['PHYS-151', 'ACCT-370', 'ACCT-456', 'BISC-320', 'EE-477'], slot: { date: '2026-12-14', start: '16:30', end: '18:30' } },
    { courses: ['CSCI-170', 'CSCI-270'], slot: { date: '2026-12-16', start: '14:00', end: '16:00' } },
    { courses: ['ACCT-371'], slot: { date: '2026-12-09', start: '08:00', end: '10:00' } },
    { courses: ['BISC-120', 'BUAD-281'], slot: { date: '2026-12-16', start: '08:00', end: '10:00' } },
  ],
};

const TERMS: Record<string, FinalsTerm> = { [FALL_2026.termCode]: FALL_2026 };

export const finalsSourceFor = (termCode: string) => {
  const t = TERMS[termCode];
  return t ? { termCode: t.termCode, label: t.label, url: t.sourceUrl } : null;
};

export const supportedTerms = () => Object.keys(TERMS);

// ── Meeting times ───────────────────────────────────────────────────────────

/** Day codes as classes.usc.edu reports them. */
const DAY_INDEX: Record<string, number> = { M: 1, T: 2, W: 3, H: 4, R: 4, Th: 4, F: 5, S: 6, Sa: 6, U: 0, Su: 0 };
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface Meeting {
  /** JS weekday numbers (0 = Sunday), sorted. */
  days: number[];
  start: number;
  end: number;
}

/** "MW", "TH", "F", "MWF" … → weekday numbers. Accepts either H or Th for Thursday. */
export function parseDayCode(code: string): number[] {
  const out = new Set<number>();
  const re = /Th|Sa|Su|[MTWHRFSU]/g;
  for (const m of code.matchAll(re)) {
    const d = DAY_INDEX[m[0]];
    if (d !== undefined) out.add(d);
  }
  return [...out].sort((a, b) => a - b);
}

const toMin = (t: unknown): number | null => {
  if (typeof t !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export function describeMeeting(m: Meeting): string {
  const t = (min: number) => {
    const hr = Math.floor(min / 60);
    const h12 = ((hr + 11) % 12) + 1;
    return `${h12}:${String(min % 60).padStart(2, '0')} ${hr < 12 ? 'AM' : 'PM'}`;
  };
  return `${m.days.map((d) => DAY_NAMES[d]).join('/')} ${t(m.start)}–${t(m.end)}`;
}

// ── Resolution ──────────────────────────────────────────────────────────────

/** Weekday of a YYYY-MM-DD date. */
const weekday = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** First date in the exam window that falls on one of the class's meeting days. */
function firstClassDayInWindow(term: FinalsTerm, days: number[]): string | null {
  for (let d = term.window.first; d <= term.window.last; d = addDays(d, 1)) {
    if (days.includes(weekday(d))) return d;
  }
  return null;
}

const inRow = (rows: Row[], start: number) => rows.find((r) => start >= r.from && start < r.to);

/**
 * The official final exam slot for one class, or a reason it can't be
 * determined from the published schedule.
 */
export function resolveFinal(termCode: string, courseCode: string, m: Meeting | null): { slot: ExamSlot } | { reason: string } {
  const term = TERMS[termCode];
  if (!term) return { reason: 'No official final exam schedule is loaded for this term.' };

  const code = courseCode.toUpperCase();
  for (const ex of term.exceptions) {
    if (ex.courses.includes(code)) return { slot: { ...ex.slot, rule: `Exception listed for ${code}` } };
  }

  if (!m || m.days.length === 0) return { reason: 'This section has no fixed meeting time (TBA or online), so the schedule can’t place its final.' };
  const { days, start, end } = m;
  const weekdays = days.filter((d) => d >= 1 && d <= 5);

  if (weekdays.length === 0 && days.includes(6)) {
    return start < h(12)
      ? { slot: { ...term.saturday.morning, rule: 'Saturday mornings only' } }
      : { slot: { ...term.saturday.afternoon, rule: 'Saturday afternoons only' } };
  }
  if (weekdays.length === 0) return { reason: 'This section meets only on Sunday, which the schedule doesn’t cover.' };

  // "Classes with first meeting on M or W or F → same as MWF; T or Th → same as TTh."
  const pattern: 'MWF' | 'TTh' = weekdays[0] === 2 || weekdays[0] === 4 ? 'TTh' : 'MWF';

  if (start >= h(18)) {
    if (weekdays.length === 1) {
      const date = firstClassDayInWindow(term, weekdays);
      return date
        ? { slot: { date, start: '19:00', end: '21:00', rule: '6:00 PM or later, meeting once weekly: 7:00–9:00 PM, first scheduled class period' } }
        : { reason: 'No class meeting falls inside the final exam window.' };
    }
    const eight = start >= h(20);
    const slot = pattern === 'MWF' ? (eight ? term.evening.mw8 : term.evening.mw6) : eight ? term.evening.tth8 : term.evening.tth6;
    return { slot: { ...slot, rule: `${eight ? '8:00' : '6:00'} PM ${pattern === 'MWF' ? 'MW' : 'TTh'}` } };
  }

  if (start >= h(16)) {
    const date = firstClassDayInWindow(term, weekdays);
    return date
      ? { slot: { date, start: '16:30', end: '18:30', rule: 'Starts 4:00–6:00 PM: 4:30–6:30 PM, first scheduled class period' } }
      : { reason: 'No class meeting falls inside the final exam window.' };
  }

  if (pattern === 'TTh' && start >= h(10) && start < h(11)) {
    const r = end <= h(11) ? term.tth1000.short : term.tth1000.long;
    return { slot: { date: r.date, start: r.start, end: r.end, rule: r.label } };
  }

  const row = inRow(pattern === 'MWF' ? term.mwf : term.tth, start);
  if (!row) return { reason: `A ${hhmm(start)} ${pattern} start time isn’t covered by the published schedule.` };
  return { slot: { date: row.date, start: row.start, end: row.end, rule: row.label } };
}

// ── Schedule of Classes (public) ────────────────────────────────────────────

const SOC_COURSE_URL = 'https://classes.usc.edu/api/Courses/Course';
const SOC_TIMEOUT_MS = 15_000;
const CACHE_MS = 60 * 60 * 1000;

interface SocSection { id: string; mode: string | null; linkCode: string | null; meeting: Meeting | null }
interface SocCourse { code: string; sections: SocSection[] }

const cache = new Map<string, { at: number; value: Promise<SocCourse | null> }>();

function parseSocCourse(body: unknown): SocCourse | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const sc = b.scheduledCourseCode as Record<string, unknown> | undefined;
  const code = typeof sc?.courseHyphen === 'string' ? `${sc.courseHyphen}${typeof sc.suffix === 'string' ? sc.suffix : ''}` : null;
  if (!code || !Array.isArray(b.sections)) return null;

  const sections: SocSection[] = [];
  for (const raw of b.sections) {
    if (!raw || typeof raw !== 'object') continue;
    const s = raw as Record<string, unknown>;
    if (typeof s.sisSectionId !== 'string') continue;
    let meeting: Meeting | null = null;
    if (Array.isArray(s.schedule)) {
      const days = new Set<number>();
      let start: number | null = null;
      let end: number | null = null;
      for (const slot of s.schedule) {
        const r = slot as Record<string, unknown>;
        const st = toMin(r?.startTime);
        const en = toMin(r?.endTime);
        if (typeof r?.dayCode !== 'string' || st === null || en === null) continue;
        for (const d of parseDayCode(r.dayCode)) days.add(d);
        if (start === null || st < start) { start = st; end = en; }
      }
      if (days.size && start !== null && end !== null) meeting = { days: [...days].sort((a, b2) => a - b2), start, end };
    }
    sections.push({
      id: s.sisSectionId,
      mode: typeof s.rnrMode === 'string' ? s.rnrMode : null,
      linkCode: typeof s.linkCode === 'string' ? s.linkCode : null,
      meeting,
    });
  }
  return { code: code.toUpperCase(), sections };
}

function fetchSocCourse(termCode: string, courseCode: string): Promise<SocCourse | null> {
  const key = `${termCode}:${courseCode}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const url = `${SOC_COURSE_URL}?termCode=${encodeURIComponent(termCode)}&courseCode=${encodeURIComponent(courseCode)}`;
  const value = fetch(url, { signal: AbortSignal.timeout(SOC_TIMEOUT_MS), headers: { Accept: 'application/json' } })
    .then(async (r) => (r.ok ? parseSocCourse(await r.json()) : null))
    .catch(() => null);
  cache.set(key, { at: Date.now(), value });
  void value.then((v) => { if (!v) cache.delete(key); });
  return value;
}

// ── Brightspace course → official final ─────────────────────────────────────

export interface OfficialFinal {
  courseId: number;
  courseName: string;
  courseCode: string;
  sectionId: string;
  /** e.g. "Tue 5:00 PM–7:20 PM", or null if unknown. */
  meeting: string | null;
  exam: ExamSlot | null;
  /** Why no slot could be determined. */
  reason: string | null;
}

/**
 * USC Brightspace shells carry "TERM_SECTION" codes (e.g. "20263_30202") and
 * course names like "20263 CSCI-561: …". Returns null when either is missing.
 */
export function parseUscCourse(name: string, code: string | null): { termCode: string; sectionId: string; courseCode: string } | null {
  const sec = code ? /^(\d{5})_(\d{5})$/.exec(code.trim()) : null;
  const course = /\b([A-Z]{2,5})-(\d{3}[A-Z]?)\b/.exec(name);
  if (!sec || !course) return null;
  return { termCode: sec[1], sectionId: sec[2], courseCode: `${course[1]}-${course[2]}` };
}

export async function officialFinalFor(course: { id: number; name: string; code: string | null }): Promise<OfficialFinal | null> {
  const parsed = parseUscCourse(course.name, course.code);
  if (!parsed || !TERMS[parsed.termCode]) return null;
  const base = { courseId: course.id, courseName: course.name, courseCode: parsed.courseCode, sectionId: parsed.sectionId };

  const soc = await fetchSocCourse(parsed.termCode, parsed.courseCode);
  if (!soc) {
    // Exceptions don't depend on meeting time, so they still resolve.
    const r = resolveFinal(parsed.termCode, parsed.courseCode, null);
    return 'slot' in r
      ? { ...base, meeting: null, exam: r.slot, reason: null }
      : { ...base, meeting: null, exam: null, reason: 'Couldn’t read this course from the USC Schedule of Classes.' };
  }

  let section = soc.sections.find((s) => s.id === parsed.sectionId);
  // A Brightspace shell tied to a discussion/lab section: use its linked lecture's time.
  if (section && section.mode !== 'Lecture') {
    section = soc.sections.find((s) => s.mode === 'Lecture' && s.linkCode === section!.linkCode) ?? section;
  }
  if (!section) return { ...base, meeting: null, exam: null, reason: `Section ${parsed.sectionId} isn’t in the USC Schedule of Classes.` };

  const r = resolveFinal(parsed.termCode, soc.code, section.meeting);
  return {
    ...base,
    meeting: section.meeting ? describeMeeting(section.meeting) : null,
    exam: 'slot' in r ? r.slot : null,
    reason: 'reason' in r ? r.reason : null,
  };
}
