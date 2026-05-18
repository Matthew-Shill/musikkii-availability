const ical = require("node-ical");
const {
  slotOverlapsBusyEvent,
  expandCalendarToBusyEvents
} = require("../lib/calendar");

const STUDIO_TIME_ZONE = "America/Denver";

function pad2(value) {
  return String(value).padStart(2, "0");
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
    if (part.type !== "literal") map[part.type] = part.value;
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

const sampleIcs = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Musikkii Test//EN
BEGIN:VEVENT
UID:one-off-lesson
DTSTART;TZID=America/Denver:20260518T133000
DTEND;TZID=America/Denver:20260518T140000
SUMMARY:One-off Lesson
END:VEVENT
BEGIN:VEVENT
UID:weekly-lesson
DTSTART;TZID=America/Denver:20260511T160000
DTEND;TZID=America/Denver:20260511T164500
RRULE:FREQ=WEEKLY;BYDAY=MO
SUMMARY:Weekly Lesson
END:VEVENT
END:VCALENDAR`;

async function main() {
  const parsed = ical.sync.parseICS(sampleIcs);
  const rangeStart = zonedTimeToUtc(
    { year: 2026, month: 5, day: 1, hour: 0, minute: 0, second: 0 },
    STUDIO_TIME_ZONE
  );
  const rangeEnd = zonedTimeToUtc(
    { year: 2026, month: 6, day: 30, hour: 23, minute: 59, second: 59 },
    STUDIO_TIME_ZONE
  );

  const busy = expandCalendarToBusyEvents(parsed, rangeStart, rangeEnd, STUDIO_TIME_ZONE);

  const slotStart = zonedTimeToUtc(
    { year: 2026, month: 5, day: 18, hour: 13, minute: 30, second: 0 },
    STUDIO_TIME_ZONE
  );
  const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);

  const overlapsLesson = slotOverlapsBusyEvent(slotStart, slotEnd, busy);

  const openStart = zonedTimeToUtc(
    { year: 2026, month: 5, day: 18, hour: 10, minute: 0, second: 0 },
    STUDIO_TIME_ZONE
  );
  const openEnd = new Date(openStart.getTime() + 30 * 60 * 1000);
  const overlapsOpenSlot = slotOverlapsBusyEvent(openStart, openEnd, busy);

  const weeklyStart = zonedTimeToUtc(
    { year: 2026, month: 5, day: 18, hour: 16, minute: 0, second: 0 },
    STUDIO_TIME_ZONE
  );
  const weeklyEnd = new Date(weeklyStart.getTime() + 30 * 60 * 1000);
  const overlapsWeekly = slotOverlapsBusyEvent(weeklyStart, weeklyEnd, busy);

  console.log("busy count", busy.length);
  console.log("13:30 slot blocked", overlapsLesson);
  console.log("10:00 slot open", !overlapsOpenSlot);
  console.log("16:00 slot blocked", overlapsWeekly);

  if (!overlapsLesson || overlapsOpenSlot || !overlapsWeekly) {
    process.exitCode = 1;
    console.error("calendar overlap test failed");
  } else {
    console.log("calendar overlap test passed");
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
