let allSlots = [];
let slotsByDate = new Map();
let selectedDuration = 30;
let selectedDate = "";
let selectedTime = "";
let currentMonthDate = null;
let isSubmitting = false;

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

function buildSlotsMap(slots) {
  const map = new Map();
  slots.forEach(day => {
    map.set(day.date, day.slots || []);
  });
  return map;
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

  for (const [dateKey, slots] of slotsByDate.entries()) {
    const date = parseLocalDate(dateKey);
    if (date >= start && date <= end && slots.length) {
      return dateKey;
    }
  }
  return "";
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
  slotsByDate = buildSlotsMap(allSlots);

  if (!allSlots.length) {
    setAvailabilityStatus("No openings available right now.");
    renderEmptyCalendar();
    renderTimeList();
    return;
  }

  setAvailabilityStatus("");

  const firstAvailable = parseLocalDate(allSlots[0].date);
  currentMonthDate = new Date(firstAvailable.getFullYear(), firstAvailable.getMonth(), 1);

  selectedDate = findFirstAvailableDateInMonth(currentMonthDate) || allSlots[0].date;

  renderCalendar();
  renderTimeList();
  updateSelectionCard();
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
    const hasSlots = slotsByDate.has(dateKey) && slotsByDate.get(dateKey).length > 0;
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
  subtext.textContent = "Select a time for your weekly lesson.";

  const daySlots = slotsByDate.get(selectedDate) || [];

  if (!daySlots.length) {
    timeList.innerHTML = `<p class="empty-times">No openings on this day.</p>`;
    return;
  }

  timeList.innerHTML = daySlots.map(slot => `
    <button
      type="button"
      class="time-btn ${selectedTime === slot.label ? "selected" : ""}"
      data-time="${slot.label}">
      ${slot.label}
    </button>
  `).join("");

  document.querySelectorAll(".time-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedTime = btn.dataset.time;
      document.getElementById("requestedDate").value = selectedDate;
      document.getElementById("requestedTime").value = selectedTime;
      document.getElementById("requestedDuration").value = String(selectedDuration);
      renderTimeList();
      updateSelectionCard();
    });
  });
}

function updateSelectionCard() {
  const card = document.getElementById("selection-card");
  if (!card) return;

  if (!selectedDate || !selectedTime) {
    clearSelectionCard();
    return;
  }

  card.classList.remove("empty");
  card.innerHTML = `
    <div class="selection-meta">
      <span class="meta-pill">👤 Matthew Shill</span>
      <span class="meta-pill">🕒 ${selectedTime} - ${formatEndTime(selectedTime, selectedDuration)}</span>
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

function formatEndTime(startLabel, duration) {
  const match = startLabel.match(/^(\d{1,2}):(\d{2})\s(AM|PM)$/);
  if (!match) return startLabel;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3];

  if (meridiem === "PM" && hours !== 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;

  const total = hours * 60 + minutes + Number(duration);
  let endHours = Math.floor(total / 60) % 24;
  const endMinutes = total % 60;
  const endMeridiem = endHours >= 12 ? "PM" : "AM";
  const displayHour = endHours % 12 === 0 ? 12 : endHours % 12;

  return `${displayHour}:${String(endMinutes).padStart(2, "0")} ${endMeridiem}`;
}

function showSuccessModal({ studentName, requestedDate, requestedTime, requestedDuration }) {
  const existing = document.getElementById("request-success-modal-overlay");
  if (existing) existing.remove();

  const formattedDate = formatSelectedDateLabel(requestedDate);
  const endTime = formatEndTime(requestedTime, requestedDuration);

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
    <div style="font-size:13px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#0331bd; margin-bottom:8px;">
      Request Received
    </div>
    <h3 style="margin:0 0 12px 0; font-size:28px; line-height:1.2; color:#111827;">
      Your lesson request was submitted successfully
    </h3>
    <p style="margin:0 0 18px 0; font-size:16px; line-height:1.6; color:#374151;">
      Thanks${studentName ? `, ${studentName}` : ""}. We received your weekly lesson request and will review it manually.
    </p>

    <div style="background:#f8fafc; border:1px solid #e5e7eb; border-radius:14px; padding:16px; margin-bottom:18px;">
      <div style="font-size:14px; line-height:1.7; color:#374151;">
        <div><strong>Date:</strong> ${formattedDate}</div>
        <div><strong>Time:</strong> ${requestedTime} - ${endTime}</div>
        <div><strong>Duration:</strong> ${requestedDuration} min</div>
      </div>
    </div>

    <p style="margin:0 0 22px 0; font-size:15px; line-height:1.6; color:#374151;">
      You do not need to submit another request. We’ll follow up once your lesson time has been reviewed and confirmed.
    </p>

    <button
      id="request-success-close"
      type="button"
      style="
        width:100%;
        border:none;
        border-radius:12px;
        background:#0331bd;
        color:#ffffff;
        font-size:16px;
        font-weight:700;
        padding:14px 18px;
        cursor:pointer;
      "
    >
      Done
    </button>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const closeModal = () => {
    overlay.remove();
  };

  overlay.addEventListener("click", e => {
    if (e.target === overlay) closeModal();
  });

  document.getElementById("request-success-close").addEventListener("click", closeModal);
}

function bindStaticEvents() {
  document.querySelectorAll("[data-duration-picker]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-duration-picker]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      loadAvailability(Number(btn.dataset.durationPicker));
    });
  });

  document.getElementById("prev-month-btn").addEventListener("click", () => {
    if (!currentMonthDate) return;
    currentMonthDate = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() - 1, 1);
    const firstAvailable = findFirstAvailableDateInMonth(currentMonthDate);
    if (firstAvailable) {
      selectedDate = firstAvailable;
      selectedTime = "";
      document.getElementById("requestedDate").value = selectedDate;
      document.getElementById("requestedTime").value = "";
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
    const studentName = document.getElementById("studentName").value;
    const email = document.getElementById("email").value;
    const notes = document.getElementById("notes").value;

    if (!requestedDate || !requestedTime || !requestedDuration) {
      formStatus.textContent = "Please choose a day and time first.";
      return;
    }

    const payload = {
      studentName,
      email,
      duration: requestedDuration,
      requestedDate,
      requestedTime,
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
        requestedTime,
        requestedDuration
      });

      form.reset();
      document.getElementById("requestedDate").value = "";
      document.getElementById("requestedTime").value = "";
      document.getElementById("requestedDuration").value = "";
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
  bindStaticEvents();
  loadAvailability(30);
});
