from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.simulator import (
    build_machine_catalog,
    generate_telemetry,
    get_fault_scenarios,
    get_machine,
    get_machine_snapshot,
)

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(
    title="SIAS Hub Industrial Machine Simulator",
    version="1.0.0",
    description=(
        "Synthetic industrial telemetry and digital-twin fault simulation for SIAS Hub."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/", include_in_schema=False)
async def dashboard_root() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/dashboard", include_in_schema=False)
async def dashboard_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api")
def read_root():
    return {
        "name": "SIAS Hub Industrial Machine Simulator",
        "tagline": "Synthetic industrial telemetry and digital-twin fault simulation",
        "machines": len(build_machine_catalog()),
        "fault_scenarios": list(get_fault_scenarios().keys()),
    }


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "sias-hub-industrial-machine-simulator"}


@app.get("/machines")
def list_machines():
    return {"machines": build_machine_catalog()}


@app.get("/machines/{machine_id}")
def get_machine_details(machine_id: str):
    machine = get_machine(machine_id)
    if machine is None:
        return {"error": f"Machine '{machine_id}' was not found."}
    return machine


@app.get("/machines/{machine_id}/snapshot")
def get_snapshot(machine_id: str):
    machine = get_machine(machine_id)
    if machine is None:
        return {"error": f"Machine '{machine_id}' was not found."}
    return get_machine_snapshot(machine_id)


@app.get("/machines/{machine_id}/fault-scenarios")
def machine_fault_scenarios(machine_id: str):
    machine = get_machine(machine_id)
    if machine is None:
        return {"error": f"Machine '{machine_id}' was not found."}
    return {
        "machine_id": machine_id,
        "machine_type": machine["type"],
        "fault_scenarios": list(get_fault_scenarios().keys()),
    }


@app.get("/machines/{machine_id}/telemetry")
def machine_telemetry(
    machine_id: str,
    duration_minutes: int = 10,
    scenario: str = "normal",
    sample_rate_hz: float = 1.0,
):
    machine = get_machine(machine_id)
    if machine is None:
        return {"error": f"Machine '{machine_id}' was not found."}

    telemetry = generate_telemetry(
        machine_id=machine_id,
        machine_type=machine["type"],
        duration_minutes=duration_minutes,
        scenario=scenario,
        sample_rate_hz=sample_rate_hz,
    )
    return {
        "machine_id": machine_id,
        "machine_type": machine["type"],
        "scenario": scenario,
        "point_count": len(telemetry),
        "telemetry": telemetry,
    }


@app.get("/fault-scenarios")
def list_fault_scenarios():
    return {"fault_scenarios": get_fault_scenarios()}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

