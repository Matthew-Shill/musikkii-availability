let currentSlots = [];
let selectedDuration = 30;
let selectedDate = "";
let selectedTime = "";

async function loadAvailability(duration = 30) {
  selectedDuration = duration;
  selectedDate = "";
  selectedTime = "";

  const dayPicker = document.getElementById("day-picker");
  const timePicker = document.getElementById("time-picker");
  const status = document.getElementById("availability-status");

  dayPicker.innerHTML = "";
  timePicker.innerHTML = "";
  status.textContent = "Loading availability...";

  const res = await fetch(`/api/availability?duration=${duration}&days=14`);
  const data = await res.json();

  if (!res.ok) {
    status.textContent = data.error || "Could not load availability.";
    return;
  }

  currentSlots = data.slots || [];

  if (!currentSlots.length) {
    status.textContent = "No openings available right now.";
    return;
  }

  status.textContent = "";
  renderDayPicker(currentSlots);
}

function renderDayPicker(days) {
  const dayPicker = document.getElementById("day-picker");
  const timePicker = document.getElementById("time-picker");

  dayPicker.innerHTML = days
    .map((day, index) => {
      const dateObj = new Date(`${day.date}T12:00:00`);
      const weekday = dateObj.toLocaleDateString("en-US", { weekday: "short" });
      const monthDay = dateObj.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric"
      });

      return `
        <button
          type="button"
          class="day-btn ${index === 0 ? "selected" : ""}"
          data-date="${day.date}">
          <span class="day-btn-top">${weekday}</span>
          <span class="day-btn-bottom">${monthDay}</span>
        </button>
      `;
    })
    .join("");

  document.querySelectorAll(".day-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".day-btn.selected").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");

      selectedDate = btn.dataset.date;
      renderTimePicker(selectedDate);
    });
  });

  // Default to first day
  selectedDate = days[0].date;
  renderTimePicker(selectedDate);
}

function renderTimePicker(date) {
  const timePicker = document.getElementById("time-picker");
  const dayData = currentSlots.find(day => day.date === date);

  if (!dayData || !dayData.slots.length) {
    timePicker.innerHTML = "<p>No openings on this day.</p>";
    return;
  }

  const dateLabel = new Date(`${dayData.date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric"
  });

  timePicker.innerHTML = `
    <div class="time-picker-header">
      <h3>${dateLabel}</h3>
      <p>Select a time for your weekly lesson.</p>
    </div>
    <div class="time-grid">
      ${dayData.slots.map(slot => `
        <button
          type="button"
          class="slot-btn ${selectedTime === slot.label && selectedDate === dayData.date ? "selected" : ""}"
          data-date="${dayData.date}"
          data-time="${slot.label}"
          data-duration="${selectedDuration}">
          ${slot.label}
        </button>
      `).join("")}
    </div>
  `;

  document.querySelectorAll(".slot-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".slot-btn.selected").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");

      selectedDate = btn.dataset.date;
      selectedTime = btn.dataset.time;

      document.getElementById("requestedDate").value = btn.dataset.date;
      document.getElementById("requestedTime").value = btn.dataset.time;
      document.getElementById("requestedDuration").value = btn.dataset.duration;
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-duration-picker]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-duration-picker]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      loadAvailability(Number(btn.dataset.durationPicker));
    });
  });

  loadAvailability(30);

  document.getElementById("request-form").addEventListener("submit", async e => {
    e.preventDefault();

    const requestedDate = document.getElementById("requestedDate").value;
    const requestedTime = document.getElementById("requestedTime").value;
    const requestedDuration = document.getElementById("requestedDuration").value;

    if (!requestedDate || !requestedTime || !requestedDuration) {
      document.getElementById("form-status").textContent = "Please choose a day and time first.";
      return;
    }

    const payload = {
      studentName: document.getElementById("studentName").value,
      parentName: document.getElementById("parentName").value,
      email: document.getElementById("email").value,
      phone: document.getElementById("phone").value,
      duration: requestedDuration,
      requestedDate,
      requestedTime,
      notes: document.getElementById("notes").value
    };

    const res = await fetch("/api/request-slot", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    document.getElementById("form-status").textContent =
      data.message || data.error || "Something went wrong.";
  });
});
