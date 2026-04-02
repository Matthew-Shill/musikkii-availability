async function loadAvailability(duration = 30) {
  const container = document.getElementById("availability");
  container.innerHTML = "<p>Loading availability...</p>";

  const res = await fetch(`/api/availability?duration=${duration}&days=14`);
  const data = await res.json();

  if (!res.ok) {
    container.innerHTML = `<p>${data.error || "Could not load availability."}</p>`;
    return;
  }

  renderAvailability(data.slots, duration);
}

function renderAvailability(days, duration) {
  const container = document.getElementById("availability");

  if (!days.length) {
    container.innerHTML = "<p>No openings available right now.</p>";
    return;
  }

  container.innerHTML = days.map(day => {
    const dateLabel = new Date(`${day.date}T12:00:00`).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric"
    });

    const buttons = day.slots.map(slot => `
      <button
        class="slot-btn"
        type="button"
        data-date="${day.date}"
        data-time="${slot.label}"
        data-duration="${duration}">
        ${slot.label}
      </button>
    `).join("");

    return `
      <section class="day-card">
        <h3>${dateLabel}</h3>
        <div class="slot-grid">${buttons}</div>
      </section>
    `;
  }).join("");

  document.querySelectorAll(".slot-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".slot-btn.selected").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");

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
      document.getElementById("form-status").textContent = "Please choose a lesson time first.";
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
