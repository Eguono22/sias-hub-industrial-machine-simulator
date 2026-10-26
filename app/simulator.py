from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

MACHINE_LIBRARY: List[Dict[str, Any]] = [
    {
        "id": "extruder-01",
        "name": "Extruder 01",
        "type": "extruder",
        "line": "Line A",
        "zone": "Melt zone",
        "asset_class": "primary_process",
        "location": "Production Bay 1",
        "status": "online",
        "baseline": {
            "temperature_c": 184.0,
            "pressure_bar": 122.0,
            "vibration_mm_s": 4.2,
            "power_kw": 62.0,
            "flow_l_min": 180.0,
            "motor_speed_rpm": 845.0,
        },
    },
    {
        "id": "coating-01",
        "name": "Coating Line 01",
        "type": "coating",
        "line": "Line B",
        "zone": "Coating booth",
        "asset_class": "surface_finishing",
        "location": "Coating Hall",
        "status": "online",
        "baseline": {
            "temperature_c": 68.0,
            "pressure_bar": 44.0,
            "vibration_mm_s": 2.9,
            "power_kw": 38.0,
            "flow_l_min": 320.0,
            "motor_speed_rpm": 610.0,
            "coating_thickness_um": 128.0,
            "viscosity_cP": 2150.0,
        },
    },
    {
        "id": "dryer-01",
        "name": "Dryer 01",
        "type": "dryer",
        "line": "Line B",
        "zone": "Thermal curing",
        "asset_class": "process_utility",
        "location": "Curing Zone",
        "status": "online",
        "baseline": {
            "temperature_c": 88.0,
            "pressure_bar": 31.0,
            "vibration_mm_s": 3.1,
            "power_kw": 46.0,
            "flow_l_min": 260.0,
            "motor_speed_rpm": 740.0,
        },
    },
    {
        "id": "compressor-01",
        "name": "Compressor 01",
        "type": "compressor",
        "line": "Utilities",
        "zone": "Air supply",
        "asset_class": "utility",
        "location": "Utility Room",
        "status": "online",
        "baseline": {
            "temperature_c": 76.0,
            "pressure_bar": 86.0,
            "vibration_mm_s": 3.8,
            "power_kw": 52.0,
            "flow_l_min": 410.0,
            "motor_speed_rpm": 980.0,
        },
    },
]

FAULT_SCENARIOS: Dict[str, Dict[str, Any]] = {
    "normal": {"severity": 0.0, "description": "Stable operating conditions with no abnormal drift."},
    "bearing_wear": {"severity": 0.6, "description": "Progressive bearing wear causing increased vibration and heat."},
    "heat_excess": {"severity": 0.8, "description": "Thermal runaway or cooling inefficiency causing elevated process temperature."},
    "pressure_spike": {"severity": 0.72, "description": "Rapid pressure surge caused by feed blockage or inconsistent throughput."},
    "coating_drift": {"severity": 0.68, "description": "Viscosity or nozzle drift leading to off-spec coating thickness."},
    "coolant_loss": {"severity": 0.75, "description": "Loss of cooling flow creating overheating and power draw instability."},
    "drive_misalignment": {"severity": 0.64, "description": "Misalignment in the drive train increases vibration and motor load."},
    "electrical_fault": {"severity": 0.82, "description": "Electrical instability with power fluctuation and thermal stress."},
}


def get_fault_scenarios() -> Dict[str, Dict[str, Any]]:
    return FAULT_SCENARIOS


def build_machine_catalog() -> List[Dict[str, Any]]:
    return [
        {
            "id": machine["id"],
            "name": machine["name"],
            "type": machine["type"],
            "line": machine["line"],
            "zone": machine["zone"],
            "asset_class": machine["asset_class"],
            "location": machine["location"],
            "status": machine["status"],
            "baseline": machine["baseline"],
        }
        for machine in MACHINE_LIBRARY
    ]


def get_machine(machine_id: str) -> Dict[str, Any] | None:
    for machine in MACHINE_LIBRARY:
        if machine["id"] == machine_id:
            return machine
    return None


def _signed_wave(index: int, amplitude: float, frequency: float = 1.0) -> float:
    return math.sin((index / max(1, frequency)) * 2 * math.pi) * amplitude


def _sample_value(base: float, index: int, scenario: str, sensor: str) -> float:
    noise = (index % 11) / 23.0
    drift = _signed_wave(index, 0.18 * base / 100.0, 6.0)
    scenario_factor = FAULT_SCENARIOS.get(scenario, FAULT_SCENARIOS["normal"])["severity"]

    if sensor == "temperature_c":
        temp_shift = scenario_factor * (18 if scenario in {"heat_excess", "coolant_loss", "bearing_wear"} else 10)
        return base + drift + temp_shift + noise * 2.0
    if sensor == "pressure_bar":
        pressure_shift = scenario_factor * (26 if scenario in {"pressure_spike", "coolant_loss"} else 12)
        return base + drift * 6 + pressure_shift + noise * 2.5
    if sensor == "vibration_mm_s":
        vib_shift = scenario_factor * (3.2 if scenario in {"bearing_wear", "drive_misalignment"} else 1.0)
        return base + drift * 8 + vib_shift + noise * 0.7
    if sensor == "power_kw":
        power_shift = scenario_factor * (18 if scenario in {"electrical_fault", "coolant_loss", "heat_excess"} else 8)
        return base + drift * 9 + power_shift + noise * 1.4
    if sensor == "flow_l_min":
        flow_shift = scenario_factor * (-110 if scenario in {"coolant_loss"} else -50)
        return max(0, base + drift * 16 + flow_shift + noise * 6.0)
    if sensor == "motor_speed_rpm":
        motor_shift = scenario_factor * (140 if scenario in {"electrical_fault", "drive_misalignment"} else 40)
        return base + drift * 18 + motor_shift + noise * 8.0
    if sensor == "coating_thickness_um":
        thickness_shift = scenario_factor * (32 if scenario in {"coating_drift"} else 10)
        return base + drift * 12 + thickness_shift + noise * 2.5
    if sensor == "viscosity_cP":
        return base + drift * 70 + scenario_factor * 500 + noise * 20.0
    return base + drift + noise


def get_machine_snapshot(machine_id: str) -> Dict[str, Any]:
    machine = get_machine(machine_id)
    if machine is None:
        raise ValueError(f"Machine not found: {machine_id}")

    scenario = "normal"
    latest = get_telemetry_sample(machine_id, 0, scenario)
    health_score = latest["health_score"]

    return {
        "machine_id": machine_id,
        "machine_name": machine["name"],
        "type": machine["type"],
        "status": "online",
        "health_score": round(health_score, 2),
        "current_conditions": {
            "temperature_c": latest["temperature_c"],
            "pressure_bar": latest["pressure_bar"],
            "vibration_mm_s": latest["vibration_mm_s"],
            "power_kw": latest["power_kw"],
            "flow_l_min": latest["flow_l_min"],
            "motor_speed_rpm": latest["motor_speed_rpm"],
        },
        "recommended_action": "Continue routine monitoring; no active alarm threshold reached.",
    }


def get_telemetry_sample(machine_id: str, index: float = 0, scenario: str = "normal", timestamp: datetime | None = None) -> Dict[str, Any]:
    machine = get_machine(machine_id)
    if machine is None:
        raise ValueError(f"Machine not found: {machine_id}")
    if scenario not in FAULT_SCENARIOS:
        raise ValueError(f"Unknown scenario: {scenario}")
    scenario_name = scenario
    machine_type = machine["type"]
    base = machine["baseline"]

    sensor_values = {
        "temperature_c": _sample_value(base.get("temperature_c", 50), index, scenario_name, "temperature_c"),
        "pressure_bar": _sample_value(base.get("pressure_bar", 30), index, scenario_name, "pressure_bar"),
        "vibration_mm_s": _sample_value(base.get("vibration_mm_s", 2.0), index, scenario_name, "vibration_mm_s"),
        "power_kw": _sample_value(base.get("power_kw", 25), index, scenario_name, "power_kw"),
        "flow_l_min": _sample_value(base.get("flow_l_min", 150), index, scenario_name, "flow_l_min"),
        "motor_speed_rpm": _sample_value(base.get("motor_speed_rpm", 800), index, scenario_name, "motor_speed_rpm"),
    }

    if machine_type == "coating":
        sensor_values["coating_thickness_um"] = _sample_value(base.get("coating_thickness_um", 120), index, scenario_name, "coating_thickness_um")
        sensor_values["viscosity_cP"] = _sample_value(base.get("viscosity_cP", 2200), index, scenario_name, "viscosity_cP")

    health_score = max(35.0, 100.0 - (FAULT_SCENARIOS[scenario_name]["severity"] * 65))
    health_score -= max(0.0, abs(sensor_values["temperature_c"] - base.get("temperature_c", 50)) * 0.2)
    health_score -= max(0.0, abs(sensor_values["vibration_mm_s"] - base.get("vibration_mm_s", 2.0)) * 2.0)
    health_score = max(0.0, min(100.0, health_score))

    sample = {
        "timestamp": (timestamp or datetime.now(timezone.utc)).isoformat(),
        "machine_id": machine_id,
        "scenario": scenario_name,
        "machine_type": machine_type,
        "temperature_c": round(sensor_values["temperature_c"], 2),
        "pressure_bar": round(sensor_values["pressure_bar"], 2),
        "vibration_mm_s": round(sensor_values["vibration_mm_s"], 2),
        "power_kw": round(sensor_values["power_kw"], 2),
        "flow_l_min": round(sensor_values["flow_l_min"], 2),
        "motor_speed_rpm": round(sensor_values["motor_speed_rpm"], 2),
        "health_score": round(health_score, 2),
    }

    if machine_type == "coating":
        sample["coating_thickness_um"] = round(sensor_values["coating_thickness_um"], 2)
        sample["viscosity_cP"] = round(sensor_values["viscosity_cP"], 2)

    return sample


def generate_telemetry(
    machine_id: str,
    machine_type: str,
    duration_minutes: int = 30,
    scenario: str = "normal",
    sample_rate_hz: float = 1.0,
) -> List[Dict[str, Any]]:
    if scenario not in FAULT_SCENARIOS:
        raise ValueError(f"Unknown scenario: {scenario}")
    if not math.isfinite(sample_rate_hz) or sample_rate_hz <= 0 or not math.isfinite(duration_minutes) or duration_minutes <= 0:
        raise ValueError("Duration and sample rate must be positive and finite")
    total_samples = max(1, int(duration_minutes * 60 * sample_rate_hz))
    if total_samples > 10000:
        raise ValueError("Requested telemetry exceeds 10000 samples")
    start_time = datetime.now(timezone.utc)
    return [get_telemetry_sample(machine_id, index / sample_rate_hz, scenario,
            start_time + timedelta(seconds=index / sample_rate_hz)) for index in range(total_samples)]


if __name__ == "__main__":
    print(build_machine_catalog())
    print(generate_telemetry("extruder-01", "extruder", 2, "bearing_wear", 1.0)[:2])

