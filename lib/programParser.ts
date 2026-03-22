import * as XLSX from 'xlsx';

export interface ParsedExercise {
  id: string;
  name: string;
  sets?: number;
  reps?: string;
  weight?: string;
  rest_sec?: number;
  notes?: string;
}

export interface ParsedBlock {
  id: string;
  type: string;
  name: string;
  exercises: ParsedExercise[];
}

export interface ParsedWorkout {
  name: string;
  type: string;
  duration_min: number | null;
  notes: string;
  blocks: ParsedBlock[];
}

export interface ParsedDay {
  week: number;
  day: string;
  scheduledDate: string;
  workout: ParsedWorkout;
}

export interface ParsedProgram {
  name: string;
  sport: string;
  weeks: number;
  startDate: string;
  description: string;
  days: ParsedDay[];
}

const DAY_OFFSET: Record<string, number> = {
  mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6,
};

const VALID_BLOCK_TYPES = new Set(['strength', 'emom', 'amrap', 'fortime', 'tabata', 'rest']);
const VALID_WORKOUT_TYPES = new Set(['strength', 'run', 'bike', 'swim', 'hyrox', 'hiit', 'rest', 'active_recovery', 'mixed']);

function randomId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function parseExercises(str: string): ParsedExercise[] {
  if (!str || typeof str !== 'string') return [];
  return str
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .map(part => {
      const fields = part.split('|').map(f => f.trim());
      const [name, setsRaw, reps, weight, restRaw] = fields;
      if (!name) return null;
      const sets = setsRaw ? parseInt(setsRaw, 10) : undefined;
      const rest_sec = restRaw ? parseInt(restRaw, 10) : undefined;
      const ex: ParsedExercise = {
        id: randomId(),
        name,
        sets: isNaN(sets as number) ? undefined : sets,
        reps: reps || undefined,
        weight: weight || undefined,
        rest_sec: isNaN(rest_sec as number) ? undefined : rest_sec,
      };
      return ex;
    })
    .filter((e): e is ParsedExercise => e !== null);
}

function parseBlock(
  type: string | undefined,
  name: string | undefined,
  exercises: string | undefined
): ParsedBlock | null {
  if (!type && !name && !exercises) return null;
  const rawType = (type || 'strength').toLowerCase().trim();
  const blockType = VALID_BLOCK_TYPES.has(rawType) ? rawType : 'strength';
  return {
    id: randomId(),
    type: blockType,
    name: name || blockType,
    exercises: parseExercises(exercises || ''),
  };
}

function cellStr(row: Record<string, unknown>, key: string): string {
  const val = row[key];
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function cellNum(row: Record<string, unknown>, key: string): number | null {
  const val = row[key];
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

export function parseProgramFile(buffer: Buffer): ParsedProgram {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });

  // ── Program Info sheet ──────────────────────────────────────────────────
  const infoSheet = workbook.Sheets['Program Info'];
  if (!infoSheet) throw new Error('Missing "Program Info" sheet');

  const infoRows: unknown[][] = XLSX.utils.sheet_to_json(infoSheet, { header: 1, defval: '' });
  const infoMap: Record<string, string> = {};
  for (const row of infoRows) {
    const arr = row as unknown[];
    const key = String(arr[0] ?? '').trim().toLowerCase();
    const val = String(arr[1] ?? '').trim();
    if (key) infoMap[key] = val;
  }

  const programName = infoMap['program name'] || 'Imported Program';
  const sport = infoMap['sport / goal'] || infoMap['sport'] || infoMap['goal'] || 'general';
  const totalWeeks = parseInt(infoMap['total weeks'] || '1', 10) || 1;
  const startDate = infoMap['start date'] || new Date().toISOString().slice(0, 10);
  const description = infoMap['description'] || '';

  // ── Schedule sheet ───────────────────────────────────────────────────────
  const schedSheet = workbook.Sheets['Schedule'];
  if (!schedSheet) throw new Error('Missing "Schedule" sheet');

  // Row 1 = index 0, row 2 = headers at index 1, data from index 2
  const allRows: unknown[][] = XLSX.utils.sheet_to_json(schedSheet, { header: 1, defval: '' });

  if (allRows.length < 2) throw new Error('Schedule sheet has no header row');

  const headers = (allRows[1] as unknown[]).map(h => String(h ?? '').trim().toLowerCase());

  const colIdx = (name: string) => headers.indexOf(name);

  const wIdx = colIdx('week');
  const dIdx = colIdx('day');
  const nameIdx = colIdx('workout_name');
  const typeIdx = colIdx('type');
  const durIdx = colIdx('duration_min');
  const notesIdx = colIdx('notes');
  const b1tIdx = colIdx('block1_type');
  const b1nIdx = colIdx('block1_name');
  const b1eIdx = colIdx('block1_exercises');
  const b2tIdx = colIdx('block2_type');
  const b2nIdx = colIdx('block2_name');
  const b2eIdx = colIdx('block2_exercises');
  const b3tIdx = colIdx('block3_type');
  const b3nIdx = colIdx('block3_name');
  const b3eIdx = colIdx('block3_exercises');

  const dataRows = allRows.slice(2);

  // Deduplicate workouts by name (keep first occurrence blocks)
  const workoutMap = new Map<string, ParsedWorkout>();
  const days: ParsedDay[] = [];

  for (const raw of dataRows) {
    const row = raw as unknown[];
    const getCell = (idx: number) => (idx >= 0 ? String(row[idx] ?? '').trim() : '');
    const getNum = (idx: number) => {
      if (idx < 0) return null;
      const n = Number(row[idx]);
      return isNaN(n) ? null : n;
    };

    const weekRaw = getNum(wIdx);
    const workoutName = getCell(nameIdx);

    if (!weekRaw || !workoutName) continue;

    const week = Math.round(weekRaw);
    const day = getCell(dIdx);

    const dayKey = day.charAt(0).toUpperCase() + day.slice(1, 3).toLowerCase();
    const dayOffsetKey = day.toLowerCase().slice(0, 3);
    const dayOffset = DAY_OFFSET[dayOffsetKey];

    if (dayOffset === undefined) {
      console.warn(`[programParser] Skipping row — unknown day: "${day}"`);
      continue;
    }

    if (week < 1) {
      console.warn(`[programParser] Skipping row — invalid week: ${week}`);
      continue;
    }

    const scheduledDate = addDays(startDate, (week - 1) * 7 + dayOffset);

    const rawType = getCell(typeIdx).toLowerCase();
    const workoutType = VALID_WORKOUT_TYPES.has(rawType) ? rawType : 'strength';
    const durationMin = getNum(durIdx);
    const notes = getCell(notesIdx);

    if (!workoutMap.has(workoutName)) {
      const blocks: ParsedBlock[] = [];
      const b1 = parseBlock(getCell(b1tIdx), getCell(b1nIdx), getCell(b1eIdx));
      const b2 = parseBlock(getCell(b2tIdx), getCell(b2nIdx), getCell(b2eIdx));
      const b3 = parseBlock(getCell(b3tIdx), getCell(b3nIdx), getCell(b3eIdx));
      if (b1) blocks.push(b1);
      if (b2) blocks.push(b2);
      if (b3) blocks.push(b3);

      workoutMap.set(workoutName, {
        name: workoutName,
        type: workoutType,
        duration_min: durationMin,
        notes,
        blocks,
      });
    }

    days.push({
      week,
      day: dayKey,
      scheduledDate,
      workout: workoutMap.get(workoutName)!,
    });
  }

  return {
    name: programName,
    sport,
    weeks: totalWeeks,
    startDate,
    description,
    days,
  };
}
