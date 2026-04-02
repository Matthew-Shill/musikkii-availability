module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const {
      studentName,
      parentName,
      email,
      phone,
      duration,
      requestedDate,
      requestedTime,
      notes
    } = body || {};

    if (!studentName || !email || !duration || !requestedDate || !requestedTime) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    console.log("NEW SLOT REQUEST", {
      studentName,
      parentName,
      email,
      phone,
      duration,
      requestedDate,
      requestedTime,
      notes
    });

    return res.status(200).json({
      ok: true,
      message: "Request received. We’ll confirm your weekly lesson time shortly."
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to submit request." });
  }
};
