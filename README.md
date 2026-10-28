# SIAS Hub Industrial Machine Simulator

Industrial machine simulator for SIAS Hub, generating synthetic sensor data and fault scenarios for extruders, coating systems, predictive maintenance, and digital twins.

## Overview

This project uses FastAPI to provide a lightweight simulator for industrial automation operations. It exposes synthetic telemetry for extruders, coating systems, dryers, and compressors. Each simulated machine can be run under different fault conditions, including wear, thermal stress, pressure spikes, coating drift, and electrical faults.

## Features

- Synthetic industrial telemetry generation
- Fault scenario simulation for digital twin and predictive maintenance workflows
- REST API endpoints for live monitoring and machine snapshots
- Browser-based dashboard served from the FastAPI app
- SIAS Hub-friendly industrial automation configuration

## Project structure

- `app/main.py` – FastAPI app and routes
- `app/simulator.py` – machine catalog, sensor model, and fault scenarios
- `simulator/dist/index.html` – dashboard UI, also served by FastAPI
- `simulator/dist/app.js` – API integration, browser demo, and session behavior
- `simulator/dist/style.css` – dashboard styling
- `tests/test_api.py` – backend integration tests
- `requirements.txt` – dependencies

## Quick start

On macOS, double-click `start-local.command` (or run `./start-local.command` in Terminal). It creates a local Python environment, installs dependencies, and starts the dashboard at http://localhost:8001. Keep the Terminal window open while using the app; press Ctrl+C to stop it. The first launch requires internet access to install dependencies. To select another port, run `PORT=8080 ./start-local.command`.

For manual setup:

1. Create and activate a virtual environment

```bash
python3 -m venv .venv
source .venv/bin/activate
```

2. Install dependencies

```bash
pip install -r requirements.txt
```

3. Run the application

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

4. Open the dashboard

- Dashboard: http://localhost:8000/
- API docs: http://localhost:8000/docs

The dashboard automatically connects to the same server for its machine catalog, fault scenarios, and synthetic telemetry. Use **Data source** to switch to browser demo mode. API mode supports all eight backend scenarios; demo mode retains its five local scenarios. Sessions are saved separately for each data source. If an API session loses its connection, it pauses and records a warning; choose Resume to retry.

To use a separately hosted API, open the dashboard with `?api=http://localhost:8000` (or the backend's HTTPS URL). A hosted HTTPS dashboard requires an HTTPS backend. `?mode=demo` skips the API connection. If the API catalog cannot be reached at startup, the dashboard labels and uses browser demo mode.

## Run with Docker

With Docker running, build and start the complete app from the repository root:

```bash
docker build -t sias-simulator .
docker run --rm -p 127.0.0.1:8000:8000 sias-simulator
```

Open http://localhost:8000. The image includes both the FastAPI backend and dashboard, including the machine artwork. Hosting providers can set `PORT` to choose the listening port.

## Publish online

The included `render.yaml` deploys the complete app as one Render web service, using the Dockerfile and `/health` readiness check.

1. Push this repository to GitHub.
2. Sign in to [Render](https://dashboard.render.com/) and choose **New → Blueprint**.
3. Connect `Eguono22/sias-hub-industrial-machine-simulator` and select the `main` branch.
4. Review the service configuration and create the Blueprint.
5. When deployment succeeds, open the service's HTTPS URL. The dashboard and API use the same URL; API documentation is available at `/docs`.

The Blueprint selects the free service plan. Review current [free-service limits](https://render.com/docs/free), including idle spin-down, before choosing it for ongoing use. See Render's [Blueprint documentation](https://render.com/docs/infrastructure-as-code) for account setup and deployment details.

Sessions are stored in each browser's local storage. The local app and hosted app have separate saved sessions; this app does not synchronize sessions between devices.

## Tests

```bash
pip install -r requirements-dev.txt
python -m unittest discover -s tests -v
```

The fleet endpoint `/fleet/telemetry?target=extruder-01&scenario=bearing_wear&start=0&count=10` returns up to 60 samples per request. `start` is elapsed simulation time in seconds, so accelerated sessions request consecutive samples without resetting the sensor model. Per-machine telemetry requests allow up to 10,000 samples and reject unknown scenarios and invalid rates.

## Standalone dashboard

The dashboard uses a dark industrial layout with selectable machine cards, a live health gauge, activity alerts, and temperature, pressure, and vibration charts. Select a machine card or use the telemetry selector to update the sensor overlay and charts. The digital-twin panel includes machine, schematic, and parameter views; its machine artwork is illustrative.

The browser-only dashboard lives in `simulator/dist/`. Serve that directory with a static HTTP server, for example `python3 -m http.server 8080 --directory simulator/dist`, then open http://localhost:8080/.

- Pause freezes readings, elapsed simulation time, and counters; Resume continues from that point.
- The latest session is saved in browser local storage, including scenario, target machine, speed, chart selection, view, counters, and the last 60 simulated seconds of readings. The data-point counter counts the three displayed sensor metrics for each machine.
- Reloading restores the session without advancing time while the page was closed. A paused session stays paused. Starting a new simulation resets the readings and counters.
- Activity history records scenario starts, pauses, resumes, exports, and session restores with timestamps and session numbers. Open **View all activity** to browse the latest 100 events or filter warnings; events persist across reloads.
- Saved sessions stay on the current browser and origin. If browser storage is unavailable, the dashboard continues running and shows that saving is unavailable.

## Example API calls

```bash
curl http://localhost:8000/machines
curl http://localhost:8000/machines/extruder-01/snapshot
curl "http://localhost:8000/machines/extruder-01/telemetry?duration_minutes=10&scenario=bearing_wear&sample_rate_hz=1"
```

## Included machine models

- Extruder 01
- Coating Line 01
- Dryer 01
- Compressor 01

## Supported fault scenarios

- `normal`
- `bearing_wear`
- `heat_excess`
- `pressure_spike`
- `coating_drift`
- `coolant_loss`
- `drive_misalignment`
- `electrical_fault`

## Notes

This simulator is designed for prototyping, demo environments, anomaly exploration, and digital-twin-oriented industrial monitoring workflows.

## License

MIT
