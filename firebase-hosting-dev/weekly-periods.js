function pad2(value) {
  return String(value).padStart(2, '0');
}

function parseMonthCode(monthCode) {
  const match = String(monthCode || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!year || month < 1 || month > 12) return null;
  return { year, month, monthIndex: month - 1 };
}

function toIsoDateLocal(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function addDays(date, days) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  next.setDate(next.getDate() + days);
  return next;
}

function getMondayOfWeek(date) {
  const current = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const day = current.getDay();
  current.setDate(current.getDate() + (day === 0 ? -6 : 1 - day));
  return current;
}

function countDaysByMonth(weekStart) {
  const buckets = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const date = addDays(weekStart, offset);
    const key = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
    const existing = buckets.find((item) => item.key === key);
    if (existing) existing.days += 1;
    else buckets.push({ key, month: date.getMonth() + 1, year: date.getFullYear(), days: 1 });
  }
  return buckets;
}

function getMonthWeekPeriods(monthCode) {
  const parsed = parseMonthCode(monthCode);
  if (!parsed) return [];

  const monthStart = new Date(parsed.year, parsed.monthIndex, 1, 12);
  let cursor = getMondayOfWeek(monthStart);
  if (addDays(cursor, 3).getMonth() !== parsed.monthIndex || addDays(cursor, 3).getFullYear() !== parsed.year) {
    cursor = addDays(cursor, 7);
  }

  const periods = [];
  while (true) {
    const thursday = addDays(cursor, 3);
    if (thursday.getFullYear() !== parsed.year || thursday.getMonth() !== parsed.monthIndex) break;
    const weekStart = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), 12);
    const weekEnd = addDays(weekStart, 6);
    const monthParts = countDaysByMonth(weekStart);
    const isCrossMonth = monthParts.length > 1;
    const weekNoInMonth = periods.length + 1;

    periods.push({
      weekNoInMonth,
      weekId: `WEEK-${toIsoDateLocal(weekStart)}`,
      weekStart: toIsoDateLocal(weekStart),
      weekEnd: toIsoDateLocal(weekEnd),
      periodStart: toIsoDateLocal(weekStart),
      periodEnd: toIsoDateLocal(weekEnd),
      coverageDays: 7,
      ownerMonth: `${parsed.year}-${pad2(parsed.month)}`,
      isCrossMonth,
      monthParts,
      crossMonthDescription: isCrossMonth
        ? monthParts.map((part) => `${part.days} ngày tháng ${part.month}`).join(' · ')
        : '',
      label: `Tuần ${weekNoInMonth}: ${pad2(weekStart.getDate())}/${pad2(weekStart.getMonth() + 1)}–${pad2(weekEnd.getDate())}/${pad2(weekEnd.getMonth() + 1)}`
    });
    cursor = addDays(cursor, 7);
  }
  return periods;
}

export { getMonthWeekPeriods };
