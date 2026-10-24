const machineSelect = document.getElementById('machine-select');
const scenarioSelect = document.getElementById('scenario-select');
const durationInput = document.getElementById('duration-input');
const refreshBtn = document.getElementById('refresh-btn');
const summaryCards = document.getElementById('summary-cards');
const latestValues = document.getElementById('latest-values');
const statusBox = document.getElementById('status-box');
const telemetryTableBody = document.getElementById('telemetry-table-body');

let machines = [];
let scenarios = {};

async function loadMachines() {
  const res = await fetch('/machines');
  const data = await res.json();
  machines = data.machines || [];
  machineSelect.innerHTML = machines
    .map((m) => `<option value="${m.id}">${m.name} (${m.type})</option>`)
    .join('');
}

async function loadScenarios() {
  const res = await fetch('/fault-scenarios');
  const data = await res.json();
  scenarios = data.fault_scenarios || {};
  scenarioSelect.innerHTML = Object.entries(scenarios)
    .map(([key, value]) => `<option value="${key}">${key}</option>`)
    .join('');
}

function renderSummary(machine, snapshot) {
  const health = snapshot?.health_score ?? 100;
  const statusClass = health >= 75 ? 'healthy' : health >= 50 ? 'warning' : 'critical';

  summaryCards.innerHTML = `
    <div class="card ${statusClass}">
      <span class="label">Machine</span>
      <strong>${machine.name}</strong>
      <small>${machine.type}</small>
    </div>
    <div class="card ${statusClass}">
      <span class="label">Health</span>
      <strong>${health.toFixed(1)}%</strong>
      <small>asset score</small>
    </div>
    <div class="card ${statusClass}">
      <span class="label">Location</span>
      <strong>${machine.location}</strong>
      <small>${machine.zone}</small>
    </div>
    <div class="card ${statusClass}">
      <span class="label">Line</span>
      <strong>${machine.line}</strong>
      <small>${machine.asset_class}</small>
    </div>
  `;
}

function renderLatest(snapshot) {
  const latest = snapshot?.current_conditions || {};
  const metrics = [
    ['Temperature', `${latest.temperature_c ?? '—'} °C`],
    ['Pressure', `${latest.pressure_bar ?? '—'} bar`],
    ['Vibration', `${latest.vibration_mm_s ?? '—'} mm/s`],
    ['Power', `${latest.power_kw ?? '—'} kW`],
    ['Flow', `${latest.flow_l_min ?? '—'} L/min`],
    ['Motor speed', `${latest.motor_speed_rpm ?? '—'} RPM`],
  ];

  latestValues.innerHTML = metrics
    .map(([label, value]) => `
      <div class="metric-item">
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    `)
    .join('');
}

function renderStatus(snapshot, machine) {
  const health = snapshot?.health_score ?? 100;
  const action = snapshot?.recommended_action || 'No recommendation currently available.';
  const status = health >= 75 ? 'Healthy' : health >= 50 ? 'Monitor closely' : 'Action required';
  const tone = health >= 75 ? 'safe' : health >= 50 ? 'warn' : 'danger';

  statusBox.innerHTML = `
    <div class="status-pill ${tone}">${status}</div>
    <p><strong>${machine.name}</strong> is running in ${machine.zone.toLowerCase()}.</p>
    <p>${action}</p>
  `;
}

function renderTelemetry(rows) {
  telemetryTableBody.innerHTML = rows
    .slice(-8)
    .reverse()
    .map((row) => `
      <tr>
        <td>${new Date(row.timestamp).toLocaleTimeString()}</td>
        <td>${row.temperature_c}</td>
        <td>${row.pressure_bar}</td>
        <td>${row.vibration_mm_s}</td>
        <td>${row.power_kw}</td>
        <td>${row.flow_l_min}</td>
        <td>${row.health_score}</td>
      </tr>
    `)
    .join('');
}

async function refreshDashboard() {
  const machineId = machineSelect.value;
  const scenario = scenarioSelect.value;
  const duration = Number(durationInput.value || 10);
  const machine = machines.find((m) => m.id === machineId) || machines[0];

  if (!machine) return;

  const [snapshotRes, telemetryRes] = await Promise.all([
    fetch(`/machines/${machine.id}/snapshot`),
    fetch(`/machines/${machine.id}/telemetry?duration_minutes=${duration}&scenario=${scenario}&sample_rate_hz=1`),
  ]);

  const snapshot = await snapshotRes.json();
  const telemetry = await telemetryRes.json();

  renderSummary(machine, snapshot);
  renderLatest(snapshot);
  renderStatus(snapshot, machine);
  renderTelemetry(telemetry.telemetry || []);
}

machineSelect.addEventListener('change', refreshDashboard);
scenarioSelect.addEventListener('change', refreshDashboard);
durationInput.addEventListener('change', refreshDashboard);
refreshBtn.addEventListener('click', refreshDashboard);

(async function init() {
  await Promise.all([loadMachines(), loadScenarios()]);
  refreshDashboard();
})();
