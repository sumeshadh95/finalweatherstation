#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>

// Change these in the lab.
const char* WIFI_SSID = "Xamklab";
const char* WIFI_PASSWORD = "studentXAMK";
const char* MQTT_HOST = "172.20.49.17";
const int MQTT_PORT = 1883;

// Must match the Mosquitto username/password created with mosquitto_passwd.
const char* MQTT_USER = "esp32user";
const char* MQTT_PASSWORD = "esp32pass";

const char* DEVICE_ID = "esp32-sumesh-01";
const char* MQTT_TOPIC = "weather/esp32-sumesh-01/telemetry";

#define DHTTYPE DHT11
#define SENSOR_COUNT 3
#define WINDOW_SIZE 6

const int DHT_PINS[SENSOR_COUNT] = {25, 26, 27};
const char* SENSOR_IDS[SENSOR_COUNT] = {"dht11-1", "dht11-2", "dht11-3"};

DHT dht1(DHT_PINS[0], DHTTYPE);
DHT dht2(DHT_PINS[1], DHTTYPE);
DHT dht3(DHT_PINS[2], DHTTYPE);
DHT* dhts[SENSOR_COUNT] = {&dht1, &dht2, &dht3};

WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

float tempHistory[SENSOR_COUNT][WINDOW_SIZE];
float humHistory[SENSOR_COUNT][WINDOW_SIZE];
int historyCount[SENSOR_COUNT] = {0, 0, 0};
int historyIndex[SENSOR_COUNT] = {0, 0, 0};

void setup() {
  Serial.begin(115200);
  delay(500);

  for (int i = 0; i < SENSOR_COUNT; i++) {
    dhts[i]->begin();
  }

  connectWiFi();
  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  if (!mqttClient.connected()) {
    connectMQTT();
  }

  mqttClient.loop();
  publishMeasurements();
  delay(10000);
}

void connectWiFi() {
  Serial.print("Connecting to WiFi ");
  Serial.println(WIFI_SSID);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.print("WiFi connected. ESP32 IP: ");
  Serial.println(WiFi.localIP());
}

void connectMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("Connecting to MQTT ");
    Serial.println(MQTT_HOST);

    bool connected;
    if (strlen(MQTT_USER) > 0) {
      connected = mqttClient.connect(DEVICE_ID, MQTT_USER, MQTT_PASSWORD);
    } else {
      connected = mqttClient.connect(DEVICE_ID);
    }

    if (connected) {
      Serial.println("MQTT connected");
    } else {
      Serial.print("MQTT failed, rc=");
      Serial.println(mqttClient.state());
      delay(5000);
    }
  }
}

void publishMeasurements() {
  String payload = "{";
  payload += "\"deviceId\":\"" + String(DEVICE_ID) + "\",";
  payload += "\"rssi\":" + String(WiFi.RSSI()) + ",";
  payload += "\"sensors\":[";

  bool addedAnySensor = false;

  for (int i = 0; i < SENSOR_COUNT; i++) {
    float temperature = dhts[i]->readTemperature();
    float humidity = dhts[i]->readHumidity();

    if (isnan(temperature) || isnan(humidity)) {
      Serial.print(SENSOR_IDS[i]);
      Serial.println(": read failed");
      continue;
    }

    addToHistory(i, temperature, humidity);
    float avgTemperature = average(tempHistory[i], historyCount[i]);
    float avgHumidity = average(humHistory[i], historyCount[i]);

    if (addedAnySensor) {
      payload += ",";
    }

    payload += "{";
    payload += "\"id\":\"" + String(SENSOR_IDS[i]) + "\",";
    payload += "\"temperature\":" + String(temperature, 2) + ",";
    payload += "\"humidity\":" + String(humidity, 2) + ",";
    payload += "\"avgTemperature\":" + String(avgTemperature, 2) + ",";
    payload += "\"avgHumidity\":" + String(avgHumidity, 2);
    payload += "}";

    addedAnySensor = true;

    Serial.print(SENSOR_IDS[i]);
    Serial.print(" T=");
    Serial.print(temperature);
    Serial.print("C avg=");
    Serial.print(avgTemperature);
    Serial.print("C H=");
    Serial.print(humidity);
    Serial.print("% avg=");
    Serial.print(avgHumidity);
    Serial.println("%");
  }

  payload += "]}";

  if (addedAnySensor) {
    mqttClient.publish(MQTT_TOPIC, payload.c_str());
    Serial.print("Published to ");
    Serial.println(MQTT_TOPIC);
    Serial.println(payload);
  }
}

void addToHistory(int sensorIndex, float temperature, float humidity) {
  int index = historyIndex[sensorIndex];
  tempHistory[sensorIndex][index] = temperature;
  humHistory[sensorIndex][index] = humidity;

  historyIndex[sensorIndex] = (index + 1) % WINDOW_SIZE;
  if (historyCount[sensorIndex] < WINDOW_SIZE) {
    historyCount[sensorIndex]++;
  }
}

float average(float values[], int count) {
  if (count == 0) {
    return 0.0;
  }

  float total = 0.0;
  for (int i = 0; i < count; i++) {
    total += values[i];
  }

  return total / count;
}
