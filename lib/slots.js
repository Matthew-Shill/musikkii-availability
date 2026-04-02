function toDateKey(date, timeZone = "America/Denver") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function minutesFromMidnight(date, timeZone = "America/Denver") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);

  const hour = Number(parts.find(p => p.type === "hour")?.value || 0);
  const minute = Number(parts.find(p => p.type === "minute")?.value || 0);
  return hour * 60 + minute;
}

function buildBusyMap(events, timeZone = "America/Denver") {
  const busyByDay = new Map();

  for (const event of events) {
    if (!event.start || !event.end) continue;

    const dayKey = toDateKey(event.start, timeZone);
    const startMin = minutesFromMidnight(event.start, timeZone);
    const endMin = minutesFromMidnight(event.end, timeZone);

    if (!busyByDay.has(dayKey)) busyByDay.set(dayKey, []);
    busyByDay.get(dayKey).push([startMin, endMin]);
  }

  for (const [day, ranges] of busyByDay.entries()) {
    ranges.sort((a, b) => a[0] - b[0]);

    const merged = [];
    for (const range of ranges) {
      const last = merged[merged.length - 1];
      if (!last || range[0] > last[1]) {
        merged.push([...range]);
      } else {
        last[1] = Math.max(last[1], range[1]);
      }
    }
    busyByDay.set(day, merged);
  }

  return busyByDay;
}

function overlaps(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

function fmtMinutes(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  return `${displayHour}:${String(m).padStart(2, "0")} ${suffix}`;
}

function generateSlots({
  startDate,
  days = 14,
  duration = 30,
  workHours = {
    1: [[12 * 60, 20 * 60]],
    2: [[12 * 60, 20 * 60]],
    3: [[12 * 60, 20 * 60]],
    4: [[12 * 60, 20 * 60]],
    5: [[12 * 60, 20 * 60]],
    6: [[10 * 60, 15 * 60]]
  },
  busyEvents = [],
  timeZone = "America/Denver",
  step = 15,
  buffer = 0
}) {
  const busyByDay = buildBusyMap(busyEvents, timeZone);
  const results = [];

  for (let i = 0; i < days; i++) {
    const current = new Date(startDate);
    current.setDate(current.getDate() + i);

    const weekdayName = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short"
    }).format(current);

    const weekdayMap = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6
    };

    const weekday = weekdayMap[weekdayName];
    const windows = workHours[weekday];
    if (!windows) continue;

    const dayKey = toDateKey(current, timeZone);
    const busy = busyByDay.get(dayKey) || [];
    const daySlots = [];

    for (const [windowStart, windowEnd] of windows) {
      for (
        let slotStart = windowStart;
        slotStart + duration <= windowEnd;
        slotStart += step
      ) {
        const slotEnd = slotStart + duration;

        const blocked = busy.some(([busyStart, busyEnd]) =>
          overlaps(slotStart - buffer, slotEnd + buffer, busyStart, busyEnd)
        );

        if (!blocked) {
          daySlots.push({
            startMinutes: slotStart,
            endMinutes: slotEnd,
            label: fmtMinutes(slotStart)
          });
        }
      }
    }

    if (daySlots.length) {
      results.push({
        date: dayKey,
        slots: daySlots
      });
    }
  }

  return results;
}

module.exports = { generateSlots };
