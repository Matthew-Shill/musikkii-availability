const ical = require("node-ical");
const { generateSlots } = require("../lib/slots");

module.exports = async (req, res) => {
  try {
    const duration = Number(req.query.duration || 30);
    const days = Number(req.query.days || 14);

    if (![30, 45, 60].includes(duration)) {
      return res.status(400).json({ error: "Invalid duration." });
    }

    const feedUrl = process.env.MMS_ICS_URL;
    if (!feedUrl) {
      return res.status(500).json({ error: "Missing MMS_ICS_URL." });
    }

    const data = await ical.async.fromURL(feedUrl);

    const now = new Date();
    const futureEvents = Object.values(data)
      .filter(item => item.type === "VEVENT" && item.start && item.end)
      .filter(item => item.end > now)
      .map(item => ({
        start: item.start,
        end: item.end,
        summary: item.summary || ""
      }));

    const slots = generateSlots({
      startDate: now,
      days,
      duration,
      busyEvents: futureEvents,
      timeZone: "America/Denver",
      step: 15,
      buffer: 0,
      workHours: {
        1: [[12 * 60, 20 * 60]],
        2: [[12 * 60, 20 * 60]],
        3: [[12 * 60, 20 * 60]],
        4: [[12 * 60, 20 * 60]],
        5: [[12 * 60, 20 * 60]],
        6: [[10 * 60, 15 * 60]]
      }
    });

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json({
      duration,
      timeZone: "America/Denver",
      slots
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to load availability." });
  }
};
