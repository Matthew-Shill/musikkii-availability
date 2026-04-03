const STUDIO_TIME_ZONE = "America/Denver";
const SLOT_INTERVAL_MINUTES = 15;

const WORK_SCHEDULE = {
  0: { start: "10:00", end: "19:00" }, // Sunday
  1: { start: "10:00", end: "19:00" }, // Monday
  2: { start: "10:00", end: "19:00" }, // Tuesday
  4: { start: "10:00", end: "19:00" }, // Thursday
  5: { start: "10:00", end: "19:00" }  // Friday
};

const WEEKLY_BUSY_EVENTS_MT = [
  // Example recurring lesson blocks in Mountain Time:
  // { weekday: 1, start: "13:30", end: "14:00", label: "Monday student" },
  // { weekday: 2, start: "16:00", end: "16:45", label: "Tuesday student" },
];

const SPECIFIC_BUSY_EVENTS_MT = [
  // Example one-off blocks in Mountain Time:
  // { date: "2026-04-10", start: "11:00", end: "12:00", label: "Appointment" },
];

const WEEKDAY_MAP = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

function pad2(value) {
  return String(value).padStart(2, "0");
}

function parseTimeString(timeStr) {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
}

function getTimeZoneParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const parts = formatter.formatToParts(date);
  const map = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second)
  };
}

function getTimeZoneOffsetMilliseconds(date, timeZone) {
  const parts = getTimeZoneParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );

  return asUtc - date.getTime();
}

function zonedTimeToUtc({ year, month, day, hour, minute = 0, second = 0 }, timeZone) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);

  let date = new Date(utcGuess);
  let offset = getTimeZoneOffsetMilliseconds(date, timeZone);
  let corrected = utcGuess - offset;

  date = new Date(corrected);
  offset = getTimeZoneOffsetMilliseconds(date, timeZone);
  corrected = utcGuess - offset;

  return new Date(corrected);
}

function formatDateKeyFromParts(parts) {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function getDateKeysForNextDays(days, timeZone) {
  const keys = [];
  const seen = new Set();

  const nowParts = getTimeZoneParts(new Date(), timeZone);
  let probe = zonedTimeToUtc(
    {
      year: nowParts.year,
      month: nowParts.month,
      day: nowParts.day,
      hour: 12,
      minute: 0,
      second: 0
    },
    timeZone
  ).getTime();

  while (keys.length < days) {
    const probeParts = getTimeZoneParts(new Date(probe), timeZone);
    const dateKey = formatDateKeyFromParts(probeParts);

    if (!seen.has(dateKey)) {
      seen.add(dateKey);
      keys.push(dateKey);
    }

    probe += 24 * 60 * 60 * 1000;
  }

  return keys;
}

function getWeekdayNumberForLocalDate(dateKey, timeZone) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const probe = zonedTimeToUtc({ year, month, day, hour: 12, minute: 0, second: 0 }, timeZone);
  const weekdayShort = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short"
  }).format(probe);

  return WEEKDAY_MAP[weekdayShort];
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

function isSlotBusy({ dateKey, weekday, startMinute, endMinute }) {
  for (const event of WEEKLY_BUSY_EVENTS_MT) {
    if (event.weekday !== weekday) continue;

    const busyStart = parseTimeString(event.start);
    const busyEnd = parseTimeString(event.end);

    if (rangesOverlap(startMinute, endMinute, busyStart, busyEnd)) {
      return true;
    }
  }

  for (const event of SPECIFIC_BUSY_EVENTS_MT) {
    if (event.date !== dateKey) continue;

    const busyStart = parseTimeString(event.start);
    const busyEnd = parseTimeString(event.end);

    if (rangesOverlap(startMinute, endMinute, busyStart, busyEnd)) {
      return true;
    }
  }

  return false;
}

function buildSlotForLocalDate({ dateKey, startMinute, duration }) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const startHour = Math.floor(startMinute / 60);
  const startMinuteOfHour = startMinute % 60;

  const startUtc = zonedTimeToUtc(
    {
      year,
      month,
      day,
      hour: startHour,
      minute: startMinuteOfHour,
      second: 0
    },
    STUDIO_TIME_ZONE
  );

  const endUtc = new Date(startUtc.getTime() + duration * 60 * 1000);

  return {
    startUtc: startUtc.toISOString(),
    endUtc: endUtc.toISOString(),
    duration,
    studioDateKey: dateKey
  };
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const duration = Number(req.query.duration || 30);
    const days = Math.min(Number(req.query.days || 42), 90);

    if (![30, 45, 60].includes(duration)) {
      return res.status(400).json({ error: "Duration must be 30, 45, or 60." });
    }

    const dateKeys = getDateKeysForNextDays(days, STUDIO_TIME_ZONE);
    const slots = [];

    for (const dateKey of dateKeys) {
      const weekday = getWeekdayNumberForLocalDate(dateKey, STUDIO_TIME_ZONE);
      const schedule = WORK_SCHEDULE[weekday];

      if (!schedule) continue;

      const workStart = parseTimeString(schedule.start);
      const workEnd = parseTimeString(schedule.end);

      for (
        let startMinute = workStart;
        startMinute + duration <= workEnd;
        startMinute += SLOT_INTERVAL_MINUTES
      ) {
        const endMinute = startMinute + duration;

        if (isSlotBusy({ dateKey, weekday, startMinute, endMinute })) {
          continue;
        }

        slots.push(
          buildSlotForLocalDate({
            dateKey,
            startMinute,
            duration
          })
        );
      }
    }

    slots.sort((a, b) => new Date(a.startUtc) - new Date(b.startUtc));

    return res.status(200).json({
      ok: true,
      studioTimeZone: STUDIO_TIME_ZONE,
      slotIntervalMinutes: SLOT_INTERVAL_MINUTES,
      workSchedule: WORK_SCHEDULE,
      slots
    });
  } catch (error) {
    console.error("availability error:", error);
    return res.status(500).json({ error: "Failed to load availability." });
  }
};
