# Final Weather Station

This project is for the IoT final exercise.

## Components

- ESP32
- 3 x DHT11 temperature and humidity sensors
- Debian virtual machine in VirtualBox
- Mosquitto MQTT broker
- Node.js Express web server
- SQLite database
- REST API and browser dashboard

## Wiring

Use 3.3V for all DHT11 sensors.

| DHT11 sensor | VCC | GND | DATA |
| --- | --- | --- | --- |
| Sensor 1 | ESP32 3V3 | ESP32 GND | GPIO 25 |
| Sensor 2 | ESP32 3V3 | ESP32 GND | GPIO 26 |
| Sensor 3 | ESP32 3V3 | ESP32 GND | GPIO 27 |

If the DHT11 modules have only bare sensors, add a 10k pull-up resistor between DATA and 3V3 for each sensor. If they are common 3-pin modules, the pull-up resistor is usually already included.

## Debian setup

Set VirtualBox network adapter to Bridged Adapter.

```bash
sudo apt update
sudo apt install -y mosquitto mosquitto-clients nodejs npm build-essential python3 make g++ sqlite3
```

Create Mosquitto config with anonymous access disabled:

```bash
sudo nano /etc/mosquitto/conf.d/weather-station.conf
```

Add:

```conf
listener 1883
allow_anonymous false
password_file /etc/mosquitto/passwd
```

Create the MQTT user:

```bash
sudo mosquitto_passwd -c /etc/mosquitto/passwd esp32user
```

Use this password when asked:

```text
esp32pass
```

Restart and check:

```bash
sudo chown root:mosquitto /etc/mosquitto/passwd
sudo chmod 640 /etc/mosquitto/passwd
sudo systemctl restart mosquitto.service
systemctl status mosquitto.service
ip a
```

## Run the server

```bash
cd final-weather-station/server
npm install
MQTT_URL=mqtt://localhost:1883 MQTT_USER=esp32user MQTT_PASSWORD=esp32pass MQTT_TOPIC='weather/+/telemetry' npm start
```

Open from Windows browser:

```text
http://DEBIAN_IP:3000
```

## Test MQTT before uploading ESP32 code

Replace `DEBIAN_IP` with the VM IP address.

```bash
mosquitto_sub -h localhost -p 1883 -u esp32user -P esp32pass -t 'weather/+/telemetry' -v
```

In another terminal:

```bash
mosquitto_pub -h localhost -p 1883 -u esp32user -P esp32pass -t weather/test/telemetry -m '{"deviceId":"test","rssi":-50,"sensors":[{"id":"dht11-1","temperature":22.4,"humidity":40.0,"avgTemperature":22.2,"avgHumidity":39.5}]}'
```

## REST API

```text
http://DEBIAN_IP:3000/api/readings/latest
http://DEBIAN_IP:3000/api/clients/esp32-sumesh-01/data.json
http://DEBIAN_IP:3000/api/clients/esp32-sumesh-01/status
http://DEBIAN_IP:3000/api/clients/esp32-sumesh-01/sensors/dht11-1/latest
```

## ESP32 setup

Install Arduino libraries:

- DHT sensor library by Adafruit
- Adafruit Unified Sensor
- PubSubClient

Open `arduino/esp32_three_dht11_mqtt.ino` and change:

```cpp
const char* WIFI_SSID = "Xamklab";
const char* WIFI_PASSWORD = "studentXAMK";
const char* MQTT_HOST = "DEBIAN_IP";
const char* MQTT_USER = "esp32user";
const char* MQTT_PASSWORD = "esp32pass";
```

Upload to ESP32 and watch Serial Monitor at 115200 baud.

## Screenshot checklist

- Wiring photo showing ESP32 and 3 DHT11 sensors
- Arduino Serial Monitor showing raw and moving average values
- `systemctl status mosquitto.service`
- `mosquitto_sub -h localhost -p 1883 -u esp32user -P esp32pass -t 'weather/+/telemetry' -v`
- Node server terminal showing MQTT connected and stored readings
- Browser dashboard at `http://DEBIAN_IP:3000`
- REST API JSON endpoint
- SQLite evidence, for example `sqlite3 server/weather.db 'select * from readings limit 10;'`
