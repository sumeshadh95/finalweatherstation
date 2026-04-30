const cards = document.querySelector("#cards");
const statusBox = document.querySelector("#status");
const lastSeen = document.querySelector("#lastSeen");
const jsonBox = document.querySelector("#json");
const summary = document.querySelector("#summary");

async function loadLatest() {
  try {
    const response = await fetch("/api/readings/latest", { cache: "no-store" });
    const readings = await response.json();

    const realReadings = readings.filter((item) => item.device_id !== "test");
    const displayReadings = realReadings.length ? realReadings : readings;

    const now = new Date().toLocaleTimeString();

    statusBox.textContent = displayReadings.length ? "Live data received" : "Waiting for data";
    lastSeen.textContent = displayReadings.length ? `Last update: ${now}` : "Last update: n/a";

    summary.innerHTML = renderSummary(displayReadings);
    cards.innerHTML = displayReadings.map(renderCard).join("");
    jsonBox.textContent = JSON.stringify(displayReadings, null, 2);
  } catch (error) {
    statusBox.textContent = "Connection error";
    lastSeen.textContent = "Check Node server";
    cards.innerHTML = "";
    summary.innerHTML = "";
    jsonBox.textContent = error.message;
  }
}

function renderSummary(readings) {
  if (!readings.length) {
    return `
      <article class="summary-card">
        <span>No MQTT data yet</span>
        <strong>Waiting</strong>
      </article>
    `;
  }

  const avgTemp = average(readings.map((item) => item.avg_temperature));
  const avgHumidity = average(readings.map((item) => item.avg_humidity));
  const devices = new Set(readings.map((item) => item.device_id)).size;

  return `
    <article class="summary-card">
      <span>Active sensors</span>
      <strong>${readings.length}</strong>
    </article>
    <article class="summary-card">
      <span>Devices</span>
      <strong>${devices}</strong>
    </article>
    <article class="summary-card">
      <span>Average temperature</span>
      <strong>${formatNumber(avgTemp)} C</strong>
    </article>
    <article class="summary-card">
      <span>Average humidity</span>
      <strong>${formatNumber(avgHumidity)}%</strong>
    </article>
  `;
}

function renderCard(reading) {
  const temp = formatNumber(reading.avg_temperature);
  const humidity = formatNumber(reading.avg_humidity);
  const signal = signalLabel(reading.rssi);

  return `
    <article class="card">
      <div class="card-top">
        <div>
          <span class="device">${escapeHtml(reading.device_id)}</span>
          <h3>${escapeHtml(reading.sensor_id)}</h3>
        </div>
        <span class="pill ${signal.className}">RSSI ${reading.rssi ?? "n/a"}</span>
      </div>

      <div class="temperature">${temp} C</div>

      <div class="details">
        <p><span>Humidity avg</span><strong>${humidity}%</strong></p>
        <p><span>Raw temperature</span><strong>${formatNumber(reading.temperature)} C</strong></p>
        <p><span>Raw humidity</span><strong>${formatNumber(reading.humidity)}%</strong></p>
        <p><span>Stored</span><strong>${escapeHtml(reading.created_at)}</strong></p>
      </div>
    </article>
  `;
}

function average(values) {
  const valid = values.map(Number).filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
}

function signalLabel(rssi) {
  const value = Number(rssi);
  if (!Number.isFinite(value)) return { className: "neutral" };
  if (value >= -55) return { className: "good" };
  if (value >= -70) return { className: "medium" };
  return { className: "weak" };
}

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(1) : "n/a";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

loadLatest();
setInterval(loadLatest, 5000);

