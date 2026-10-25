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
- `app/static/index.html` – dashboard UI
- `app/static/app.js` – dashboard behavior
- `app/static/styles.css` – dashboard styling
- `requirements.txt` – dependencies

## Quick start

1. Create and activate a virtual environment

```bash
python -m venv .venv
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

## Standalone dashboard

The browser-only dashboard lives in `simulator/dist/`. Serve that directory with a static HTTP server, for example `python3 -m http.server 8080 --directory simulator/dist`, then open http://localhost:8080/.

- Pause freezes readings, elapsed simulation time, and counters; Resume continues from that point.
- The latest session is saved in browser local storage, including scenario, target machine, speed, chart selection, view, counters, and the last 60 simulated seconds of readings.
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
