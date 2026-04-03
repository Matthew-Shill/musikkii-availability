let allSlots = [];
let slotsByDate = new Map();
let selectedDuration = 30;
let selectedDate = "";
let selectedTime = "";
let currentMonthDate = null;
let isSubmitting = false;
let selectedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Denver";

const STUDIO_TIME_ZONE = "America/Denver";
const FALLBACK_TIME_ZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Australia/Sydney"
];

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatMonthLabel(date) {
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
  });
}

function formatSelectedDateLabel(dateStr) {
  return parseLocalDate(dateStr).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric"
  });
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

function getDateKeyForTimeZone(dateLike, timeZone) {
  const date = new Date(dateLike);
  const parts = getTimeZoneParts(date, timeZone);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function formatTimeRangeInTimeZone(startUtc, endUtc, timeZone) {
  const start = new Date(startUtc);
  const end = new Date(endUtc);

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit"
  });

  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

function getTimeZoneShortName(dateLike, timeZone) {
  const date = new Date(dateLike);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "short"
  }).formatToParts(date);

  const timeZonePart = parts.find(part => part.type === "timeZoneName");
  return timeZonePart ? timeZonePart.value : timeZone;
}

function buildSlotsMap(slots, timeZone) {
  const map = new Map();

  slots.forEach(slot => {
    const dateKey = getDateKeyForTimeZone(slot.startUtc, timeZone);
    if (!map.has(dateKey)) {
      map.set(dateKey, []);
    }
    map.get(dateKey).push(slot);
  });

  for (const [, daySlots] of map.entries()) {
    daySlots.sort((a, b) => new Date(a.startUtc) - new Date(b.startUtc));
  }

  return map;
}

function getSortedDateKeys() {
  return Array.from(slotsByDate.keys()).sort((a, b) => parseLocalDate(a) - parseLocalDate(b));
}

function getMonthGridStart(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return start;
}

function getMonthGridDays(date) {
  const start = getMonthGridStart(date);
  const days = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

function findFirstAvailableDateInMonth(monthDate) {
  const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);

  for (const dateKey of getSortedDateKeys()) {
    const date = parseLocalDate(dateKey);
    const slots = slotsByDate.get(dateKey) || [];
    if (date >= start && date <= end && slots.length) {
      return dateKey;
    }
  }

  return "";
}

function getSelectedSlot() {
  if (!selectedDate || !selectedTime) return null;
  const daySlots = slotsByDate.get(selectedDate) || [];
  return daySlots.find(slot => slot.startUtc === selectedTime) || null;
}

function setAvailabilityStatus(message) {
  const status = document.getElementById("availability-status");
  if (status) status.textContent = message || "";
}

function renderEmptyCalendar() {
  const monthLabel = document.getElementById("calendar-month-label");
  const grid = document.getElementById("calendar-grid");

  if (monthLabel) monthLabel.textContent = "No Availability";
  if (grid) grid.innerHTML = "";
}

function renderCalendar() {
  const monthLabel = document.getElementById("calendar-month-label");
  const grid = document.getElementById("calendar-grid");

  if (!monthLabel || !grid || !currentMonthDate) return;

  monthLabel.textContent = formatMonthLabel(currentMonthDate);

  const gridDays = getMonthGridDays(currentMonthDate);
  const currentMonth = currentMonthDate.getMonth();

  grid.innerHTML = gridDays.map(date => {
    const dateKey = formatDateKey(date);
    const inCurrentMonth = date.getMonth() === currentMonth;
    const hasSlots = slotsByDate.has(dateKey) && (slotsByDate.get(dateKey) || []).length > 0;
    const isSelected = selectedDate === dateKey;

    const classes = [
      "calendar-day",
      inCurrentMonth ? "" : "outside",
      hasSlots ? "has-slots" : "",
      isSelected ? "selected" : "",
      !hasSlots ? "disabled" : ""
    ].filter(Boolean).join(" ");

    return `
      <button
        type="button"
        class="${classes}"
        data-date="${dateKey}"
        ${hasSlots ? "" : "disabled"}
      >
        <span class="day-number">${date.getDate()}</span>
        ${hasSlots ? `<span class="day-dot"></span>` : ""}
      </button>
    `;
  }).join("");

  document.querySelectorAll(".calendar-day.has-slots").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedDate = btn.dataset.date;
      selectedTime = "";
      document.getElementById("requestedDate").value = selectedDate;
      document.getElementById("requestedTime").value = "";
      document.getElementById("requestedStartUtc").value = "";
      document.getElementById("requestedEndUtc").value = "";
      document.getElementById("studioDate").value = "";
      document.getElementById("studioTime").value = "";
      renderCalendar();
      renderTimeList();
      updateSelectionCard();
    });
  });
}

function renderTimeList() {
  const timeList = document.getElementById("time-list");
  const label = document.getElementById("selected-date-label");
  const subtext = document.getElementById("selected-date-subtext");

  if (!timeList || !label || !subtext) return;

  if (!selectedDate || !slotsByDate.has(selectedDate)) {
    label.textContent = "Select a date";
    subtext.textContent = "Choose a day with available openings.";
    timeList.innerHTML = `<p class="empty-times">No times selected yet.</p>`;
    return;
  }

  label.textContent = formatSelectedDateLabel(selectedDate);
  subtext.textContent = `Times shown in ${selectedTimeZone}.`;

  const daySlots = slotsByDate.get(selectedDate) || [];

  if (!daySlots.length) {
    timeList.innerHTML = `<p class="empty-times">No openings on this day.</p>`;
    return;
  }

  timeList.innerHTML = daySlots.map(slot => {
    const displayLabel = formatTimeRangeInTimeZone(slot.startUtc, slot.endUtc, selectedTimeZone);
    return `
      <button
        type="button"
        class="time-btn ${selectedTime === slot.startUtc ? "selected" : ""}"
        data-start-utc="${slot.startUtc}"
        data-end-utc="${slot.endUtc}"
        data-display-label="${displayLabel}">
        ${displayLabel}
      </button>
    `;
  }).join("");

  document.querySelectorAll(".time-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedTime = btn.dataset.startUtc;
      const selectedSlot = daySlots.find(slot => slot.startUtc === btn.dataset.startUtc);
      const studioDisplay = selectedSlot
        ? formatTimeRangeInTimeZone(selectedSlot.startUtc, selectedSlot.endUtc, STUDIO_TIME_ZONE)
        : "";

      document.getElementById("requestedDate").value = selectedDate;
      document.getElementById("requestedTime").value = btn.dataset.displayLabel;
      document.getElementById("requestedDuration").value = String(selectedDuration);
      document.getElementById("requestedTimeZone").value = selectedTimeZone;
      document.getElementById("requestedStartUtc").value = btn.dataset.startUtc;
      document.getElementById("requestedEndUtc").value = btn.dataset.endUtc;
      document.getElementById("studioDate").value = getDateKeyForTimeZone(btn.dataset.startUtc, STUDIO_TIME_ZONE);
      document.getElementById("studioTime").value = studioDisplay;

      renderTimeList();
      updateSelectionCard();
    });
  });
}

function updateSelectionCard() {
  const card = document.getElementById("selection-card");
  if (!card) return;

  const slot = getSelectedSlot();
  if (!slot) {
    clearSelectionCard();
    return;
  }

  const localDisplay = formatTimeRangeInTimeZone(slot.startUtc, slot.endUtc, selectedTimeZone);
  const localZone = getTimeZoneShortName(slot.startUtc, selectedTimeZone);
  const studioDisplay = formatTimeRangeInTimeZone(slot.startUtc, slot.endUtc, STUDIO_TIME_ZONE);
  const studioZone = getTimeZoneShortName(slot.startUtc, STUDIO_TIME_ZONE);

  card.classList.remove("empty");
  card.innerHTML = `
    <div class="selection-meta">
      <span class="meta-pill">👤 Matthew Shill</span>
      <span class="meta-pill">🕒 ${localDisplay} ${localZone}</span>
      <span class="meta-pill">🏔️ ${studioDisplay} ${studioZone}</span>
      <span class="meta-pill">🏷️ ${selectedDuration} min lesson</span>
      <a class="meta-pill meta-link" href="https://www.musikkii.com/room1" target="_blank" rel="noopener noreferrer">🎥 Musikkii | Room 1</a>
    </div>
  `;
}

function clearSelectionCard() {
  const card = document.getElementById("selection-card");
  if (!card) return;
  card.classList.add("empty");
  card.innerHTML = `<p>Select a date and time to continue.</p>`;
}

function showSuccessModal({ studentName, requestedDate, requestedTime, requestedDuration, studioTime }) {
  const existing = document.getElementById("request-success-modal-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "request-success-modal-overlay";
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(15, 23, 42, 0.55)";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.padding = "20px";
  overlay.style.zIndex = "9999";

  const modal = document.createElement("div");
  modal.style.width = "100%";
  modal.style.maxWidth = "520px";
  modal.style.background = "#ffffff";
  modal.style.borderRadius = "18px";
  modal.style.boxShadow = "0 20px 60px rgba(15, 23, 42, 0.25)";
  modal.style.padding = "28px 24px";
  modal.style.fontFamily = "inherit";
  modal.style.color = "#1f2937";

  modal.innerHTML = `
    <div style="font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#0331bd;margin-bottom:8px;">
      Request Received
    </div>
    <h3 style="margin:0 0 12px 0;font-size:28px;line-height:1.2;color:#111827;">
      Your lesson request was submitted successfully
    </h3>
    <p style="margin:0 0 18px 0;font-size:16px;line-height:1.6;color:#374151;">
      Thanks${studentName ? `, ${studentName}` : ""}. We received your weekly lesson request and will review it manually.
    </p>
    <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:14px;padding:16px;margin-bottom:18px;">
      <div style="font-size:14px;line-height:1.7;color:#374151;">
        <div><strong>Date:</strong> ${formatSelectedDateLabel(requestedDate)}</div>
        <div><strong>Your time:</strong> ${requestedTime}</div>
        <div><strong>Studio time:</strong> ${studioTime}</div>
        <div><strong>Duration:</strong> ${requestedDuration} min</div>
      </div>
    </div>
    <p style="margin:0 0 22px 0;font-size:15px;line-height:1.6;color:#374151;">
      You do not need to submit another request. We’ll follow up once your lesson time has been reviewed and confirmed.
    </p>
    <button
      id="request-success-close"
      type="button"
      style="width:100%;border:none;border-radius:12px;background:#0331bd;color:#ffffff;font-size:16px;font-weight:700;padding:14px 18px;cursor:pointer;"
    >
      Done
    </button>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const closeModal = () => overlay.remove();
  overlay.addEventListener("click", e => {
    if (e.target === overlay) closeModal();
  });
  document.getElementById("request-success-close").addEventListener("click", closeModal);
}

function populateTimeZoneSelect() {
  const select = document.getElementById("timezone-select");
  if (!select) return;

  let zones = [];
  if (typeof Intl.supportedValuesOf === "function") {
    zones = Intl.supportedValuesOf("timeZone");
  } else {
    zones = [...FALLBACK_TIME_ZONES];
  }

  if (!zones.includes(selectedTimeZone)) {
    zones.unshift(selectedTimeZone);
  }

  select.innerHTML = zones.map(zone => {
    const isSelected = zone === selectedTimeZone ? "selected" : "";
    return `<option value="${zone}" ${isSelected}>${zone}</option>`;
  }).join("");

  const requestedTimeZoneInput = document.getElementById("requestedTimeZone");
  if (requestedTimeZoneInput) {
    requestedTimeZoneInput.value = selectedTimeZone;
  }
}

function applyTimeZoneChange(newTimeZone) {
  selectedTimeZone = newTimeZone || STUDIO_TIME_ZONE;
  slotsByDate = buildSlotsMap(allSlots, selectedTimeZone);

  if (selectedTime) {
    selectedDate = getDateKeyForTimeZone(selectedTime, selectedTimeZone);
    currentMonthDate = parseLocalDate(selectedDate);
  } else {
    const sortedDateKeys = getSortedDateKeys();
    selectedDate = sortedDateKeys[0] || "";
    currentMonthDate = selectedDate ? parseLocalDate(selectedDate) : null;
  }

  const requestedTimeZoneInput = document.getElementById("requestedTimeZone");
  if (requestedTimeZoneInput) {
    requestedTimeZoneInput.value = selectedTimeZone;
  }

  renderCalendar();
  renderTimeList();
  updateSelectionCard();
}

function applyPrefillFromQueryParams() {
  const params = new URLSearchParams(window.location.search);

  const name = params.get("name");
  const email = params.get("email");
  const duration = Number(params.get("duration"));
  const timezone = params.get("timezone");

  if (name) {
    const input = document.getElementById("studentName");
    if (input) input.value = name;
  }

  if (email) {
    const input = document.getElementById("email");
    if (input) input.value = email;
  }

  if (timezone) {
    selectedTimeZone = timezone;
  }

  populateTimeZoneSelect();

  if ([30, 45, 60].includes(duration)) {
    selectedDuration = duration;
    document.querySelectorAll("[data-duration-picker]").forEach(btn => {
      btn.classList.toggle("active", Number(btn.dataset.durationPicker) === duration);
    });
    return duration;
  }

  return 30;
}

async function loadAvailability(duration = 30) {
  selectedDuration = duration;
  selectedDate = "";
  selectedTime = "";

  setAvailabilityStatus("Loading availability...");
  clearSelectionCard();

  const res = await fetch(`/api/availability?duration=${duration}&days=42`);
  const data = await res.json();

  if (!res.ok) {
    setAvailabilityStatus(data.error || "Could not load availability.");
    renderEmptyCalendar();
    renderTimeList();
    return;
  }

  allSlots = data.slots || [];
  slotsByDate = buildSlotsMap(allSlots, selectedTimeZone);

  if (!allSlots.length || !slotsByDate.size) {
    setAvailabilityStatus("No openings available right now.");
    renderEmptyCalendar();
    renderTimeList();
    return;
  }

  setAvailabilityStatus("");

  const sortedDateKeys = getSortedDateKeys();
  selectedDate = sortedDateKeys[0] || "";
  currentMonthDate = selectedDate ? parseLocalDate(selectedDate) : null;

  renderCalendar();
  renderTimeList();
  updateSelectionCard();
}

function bindStaticEvents() {
  document.querySelectorAll("[data-duration-picker]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-duration-picker]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      loadAvailability(Number(btn.dataset.durationPicker));
    });
  });

  const timezoneSelect = document.getElementById("timezone-select");
  if (timezoneSelect) {
    timezoneSelect.addEventListener("change", e => {
      applyTimeZoneChange(e.target.value);
    });
  }

  document.getElementById("prev-month-btn").addEventListener("click", () => {
    if (!currentMonthDate) return;
    currentMonthDate = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() - 1, 1);
    const firstAvailable = findFirstAvailableDateInMonth(currentMonthDate);
    if (firstAvailable) {
      selectedDate = firstAvailable;
      selectedTime = "";
      document.getElementById("requestedDate").value = selectedDate;
      document.getElementById("requestedTime").value = "";
      document.getElementById("requestedStartUtc").value = "";
      document.getElementById("requestedEndUtc").value = "";
      document.getElementById("studioDate").value = "";
      document.getElementById("studioTime").value = "";
    }
    renderCalendar();
    renderTimeList();
    updateSelectionCard();
  });

  document.getElementById("next-month-btn").addEventListener("click", () => {
    if (!currentMonthDate) return;
    currentMonthDate = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1, 1);
    const firstAvailable = findFirstAvailableDateInMonth(currentMonthDate);
    if (firstAvailable) {
      selectedDate = firstAvailable;
      selectedTime = "";
      document.getElementById("requestedDate").value = selectedDate;
      document.getElementById("requestedTime").value = "";
      document.getElementById("requestedStartUtc").value = "";
      document.getElementById("requestedEndUtc").value = "";
      document.getElementById("studioDate").value = "";
      document.getElementById("studioTime").value = "";
    }
    renderCalendar();
    renderTimeList();
    updateSelectionCard();
  });

  document.getElementById("request-form").addEventListener("submit", async e => {
    e.preventDefault();

    if (isSubmitting) return;

    const form = e.target;
    const formStatus = document.getElementById("form-status");
    const submitBtn = form.querySelector('button[type="submit"]');

    const requestedDate = document.getElementById("requestedDate").value;
    const requestedTime = document.getElementById("requestedTime").value;
    const requestedDuration = document.getElementById("requestedDuration").value;
    const requestedTimeZone = document.getElementById("requestedTimeZone").value;
    const requestedStartUtc = document.getElementById("requestedStartUtc").value;
    const requestedEndUtc = document.getElementById("requestedEndUtc").value;
    const studioDate = document.getElementById("studioDate").value;
    const studioTime = document.getElementById("studioTime").value;
    const studentName = document.getElementById("studentName").value;
    const email = document.getElementById("email").value;
    const notes = document.getElementById("notes").value;

    if (!requestedDate || !requestedTime || !requestedDuration || !requestedStartUtc) {
      formStatus.textContent = "Please choose a day and time first.";
      return;
    }

    const payload = {
      studentName,
      email,
      duration: requestedDuration,
      requestedDate,
      requestedTime,
      requestedTimeZone,
      requestedStartUtc,
      requestedEndUtc,
      studioDate,
      studioTime,
      notes
    };

    try {
      isSubmitting = true;
      formStatus.textContent = "Submitting request...";

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Submitting...";
      }

      const res = await fetch("/api/request-slot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        formStatus.textContent = data.error || "Something went wrong.";
        isSubmitting = false;
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Submit Request";
        }
        return;
      }

      formStatus.textContent = "Request submitted successfully.";

      showSuccessModal({
        studentName,
        requestedDate,
        requestedTime: `${requestedTime} (${getTimeZoneShortName(requestedStartUtc, requestedTimeZone)})`,
        requestedDuration,
        studioTime: `${studioTime} (${getTimeZoneShortName(requestedStartUtc, STUDIO_TIME_ZONE)})`
      });

      form.reset();
      document.getElementById("requestedDate").value = "";
      document.getElementById("requestedTime").value = "";
      document.getElementById("requestedDuration").value = "";
      document.getElementById("requestedTimeZone").value = selectedTimeZone;
      document.getElementById("requestedStartUtc").value = "";
      document.getElementById("requestedEndUtc").value = "";
      document.getElementById("studioDate").value = "";
      document.getElementById("studioTime").value = "";
      selectedDate = "";
      selectedTime = "";
      updateSelectionCard();
      renderCalendar();
      renderTimeList();

      if (submitBtn) {
        submitBtn.textContent = "Request Submitted";
      }
    } catch (err) {
      console.error("Submit failed:", err);
      formStatus.textContent = "Could not submit request. Please try again.";
      isSubmitting = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Request";
      }
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const initialDuration = applyPrefillFromQueryParams();
  bindStaticEvents();
  loadAvailability(initialDuration);
});
