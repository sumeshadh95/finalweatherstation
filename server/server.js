const path = require("path");
const express = require("express");
const mqtt = require("mqtt");
const Database = require("better-sqlite3");

const PORT = Number(process.env.PORT || 3000);
const MQTT_URL = process.env.MQTT_URL || "mqtt://localhost:1883";
const MQTT_TOPIC = process.env.MQTT_TOPIC || "weather/+/telemetry";
const MQTT_USER = process.env.MQTT_USER || "";
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || "";

const db = new Database(path.join(__dirname, "weather.db"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    sensor_id TEXT NOT NULL,
    temperature REAL,
    humidity REAL,
    avg_temperature REAL,
    avg_humidity REAL,
    rssi INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const insertReading = db.prepare(`
  INSERT INTO readings (
    device_id, sensor_id, temperature, humidity, avg_temperature, avg_humidity, rssi
  ) VALUES (
    @deviceId, @sensorId, @temperature, @humidity, @avgTemperature, @avgHumidity, @rssi
  )
`);

const latestBySensor = db.prepare(`
  SELECT *
  FROM readings
  WHERE device_id = ? AND sensor_id = ?
  ORDER BY id DESC
  LIMIT 1
`);

const latestAll = db.prepare(`
  SELECT r.*
  FROM readings r
  JOIN (
    SELECT device_id, sensor_id, MAX(id) AS max_id
    FROM readings
    GROUP BY device_id, sensor_id
  ) latest ON latest.max_id = r.id
  ORDER BY r.device_id, r.sensor_id
`);

const historyByDevice = db.prepare(`
  SELECT *
  FROM readings
  WHERE device_id = ?
  ORDER BY id DESC
  LIMIT ?
`);

const app = express();
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/readings/latest", (req, res) => {
  res.json(latestAll.all());
});

app.get("/api/clients/:deviceId/data.json", (req, res) => {
  const limit = Math.min(Number(req.query.limit || 100), 500);
  res.json(historyByDevice.all(req.params.deviceId, limit));
});

app.get("/api/clients/:deviceId/status", (req, res) => {
  const rows = historyByDevice.all(req.params.deviceId, 10);
  const last = rows[0] || null;
  res.json({
    deviceId: req.params.deviceId,
    online: last ? Date.now() - Date.parse(last.created_at + "Z") < 30000 : false,
    lastSeen: last ? last.created_at : null,
    sensors: rows.length
  });
});

app.get("/api/clients/:deviceId/sensors/:sensorId/latest", (req, res) => {
  const row = latestBySensor.get(req.params.deviceId, req.params.sensorId);
  if (!row) {
    res.status(404).json({ error: "No reading found" });
    return;
  }
  res.json(row);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Web server listening on http://0.0.0.0:${PORT}`);
});

const mqttOptions = {};
if (MQTT_USER) {
  mqttOptions.username = MQTT_USER;
  mqttOptions.password = MQTT_PASSWORD;
}

const client = mqtt.connect(MQTT_URL, mqttOptions);

client.on("connect", () => {
  console.log(`Connected to MQTT broker ${MQTT_URL}`);
  client.subscribe(MQTT_TOPIC, (err) => {
    if (err) {
      console.error("MQTT subscribe failed:", err.message);
      return;
    }
    console.log(`Subscribed to ${MQTT_TOPIC}`);
  });
});

client.on("message", (topic, payload) => {
  try {
    const data = JSON.parse(payload.toString());
    const deviceId = String(data.deviceId || topic.split("/")[1] || "unknown");
    const sensors = Array.isArray(data.sensors) ? data.sensors : [];

    for (const sensor of sensors) {
      insertReading.run({
        deviceId,
        sensorId: String(sensor.id),
        temperature: numberOrNull(sensor.temperature),
        humidity: numberOrNull(sensor.humidity),
        avgTemperature: numberOrNull(sensor.avgTemperature),
        avgHumidity: numberOrNull(sensor.avgHumidity),
        rssi: Number.isFinite(data.rssi) ? data.rssi : null
      });
    }

    console.log(`Stored ${sensors.length} reading(s) from ${deviceId}`);
  } catch (err) {
    console.error("Bad MQTT message:", topic, payload.toString(), err.message);
  }
});

client.on("error", (err) => {
  console.error("MQTT error:", err.message);
});

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
