import type { TrainingSeminar } from './api';

export interface TrainingSummaryRow {
  id: string;
  name: string;
  records: number;
  conducted: number;
  scheduled: number;
  participantCount: number;
  lastConducted: string | null;
}

export function trainingPeriodMetrics(programs: TrainingSeminar[], year = '') {
  const years = [...new Set(programs.flatMap((row) => row.dateFrom ? [row.dateFrom.slice(0, 4)] : []))].sort().reverse();
  const selected = programs.filter((row) => !year || (year === 'undated' ? !row.dateFrom : row.dateFrom?.startsWith(`${year}-`)));
  const monthly = Array.from({ length: 12 }, (_, index) => ({
    month: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][index],
    conducted: selected.filter((row) => row.status === 'Implemented' && row.dateFrom?.slice(5, 7) === String(index + 1).padStart(2, '0')).length,
  }));
  const annual = years.map((value) => {
    const rows = programs.filter((row) => row.dateFrom?.startsWith(`${value}-`));
    return { year: value, records: rows.length, unique: summarizeTrainings(rows).length, conducted: rows.filter((row) => row.status === 'Implemented').length, scheduled: rows.filter((row) => row.status === 'Scheduled').length };
  });
  return { years, selected, monthly, annual, undatedConducted: selected.filter((row) => row.status === 'Implemented' && !row.dateFrom).length };
}

export function summarizeTrainings(programs: TrainingSeminar[]): TrainingSummaryRow[] {
  const groups = new Map<string, TrainingSummaryRow>();
  for (const program of programs) {
    const name = program.name.trim().replace(/\s+/g, ' ');
    const id = name.toLocaleLowerCase('en');
    const group = groups.get(id) ?? { id, name, records: 0, conducted: 0, scheduled: 0, participantCount: 0, lastConducted: null };
    group.records += 1;
    group.participantCount += program.participantCount ?? 0;
    if (program.status === 'Implemented') {
      group.conducted += 1;
      if (program.dateFrom && (!group.lastConducted || program.dateFrom > group.lastConducted)) group.lastConducted = program.dateFrom;
    }
    if (program.status === 'Scheduled') group.scheduled += 1;
    groups.set(id, group);
  }
  return [...groups.values()].sort((a, b) => b.conducted - a.conducted || b.records - a.records || a.name.localeCompare(b.name));
}
