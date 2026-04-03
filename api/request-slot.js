module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const {
      studentName,
      email,
      duration,
      requestedDate,
      requestedTime,
      requestedTimeZone,
      requestedStartUtc,
      requestedEndUtc,
      studioDate,
      studioTime,
      notes
    } = body || {};

    if (!studentName || !email || !duration || !requestedDate || !requestedTime || !requestedStartUtc) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    const payload = {
  studentName,
  email,
  duration,
  requestedDate,
  requestedTime,
  requestedTimeZone: requestedTimeZone || "America/Denver",
  requestedTimeDisplay: requestedTimeDisplay || requestedTime,
  requestedStartUtc,
  requestedEndUtc: requestedEndUtc || "",
  studioDate: studioDate || "",
  studioTime: studioTime || "",
  notes: notes || "",
  submittedAt: new Date().toISOString()
};

    console.log("NEW SLOT REQUEST", payload);

    const webhookUrl = process.env.ZAPIER_SCHEDULE_REQUEST_WEBHOOK;

    if (!webhookUrl) {
      return res.status(500).json({
        error: "Missing Zapier webhook environment variable."
      });
    }

    const zapRes = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!zapRes.ok) {
      const errorText = await zapRes.text();
      console.error("Zapier webhook failed:", errorText);
      return res.status(500).json({
        error: "Failed to send request notification."
      });
    }

    return res.status(200).json({
      ok: true,
      message: "Request received. We’ll confirm your weekly lesson time shortly."
    });
  } catch (err) {
    console.error("request-slot error:", err);
    return res.status(500).json({ error: "Failed to submit request." });
  }
};
