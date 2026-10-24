(() => {
  "use strict";

  const machines = [
    { id: "EX-001", name: "Extruder EX-001", kind: "Industrial extruder", temperature: 204.8, pressure: 8.2, vibration: 2.1 },
    { id: "EX-002", name: "Extruder EX-002", kind: "Industrial extruder", temperature: 198.3, pressure: 7.8, vibration: 2.4 },
    { id: "CT-001", name: "Coating CT-001", kind: "Coating line", temperature: 191.6, pressure: 6.9, vibration: 1.7 },
    { id: "CT-002", name: "Coating CT-002", kind: "Coating line", temperature: 207.1, pressure: 8.5, vibration: 2.8 },
  ];
  const scenarios = {
    normal: { label: "Normal operation", description: "Stable production conditions with nominal sensor readings." },
    overheat: { label: "Barrel overheating", description: "Elevated barrel temperature to explore thermal alarms." },
    bearing: { label: "Bearing wear", description: "Increasing vibration to model progressive bearing wear." },
    pressure: { label: "Pressure instability", description: "Fluctuating pressure to test process monitoring." },
    coating: { label: "Coating inconsistency", description: "Variable coating-line readings to evaluate quality drift." },
  };
  const metricConfig = {
    temperature: { label: "Barrel temperature", unit: "°C", min: 190, max: 220, axis: [220, 210, 200, 190] },
    pressure: { label: "Line pressure", unit: "bar", min: 5, max: 11, axis: [11, 9, 7, 5] },
    vibration: { label: "Vibration", unit: "mm/s", min: 0, max: 8, axis: [8, 6, 4, 2] },
  };
  const samples = Array.from({ length: 31 }, (_, index) => index);
  const events = [
    { icon: "✓", text: "<b>Simulation engine</b> connected and generating data", time: "Just now" },
    { icon: "↗", text: "<b>EX-002</b> operating within normal parameters", time: "2 min ago" },
    { icon: "!", warning: true, text: "<b>EX-001</b> temperature variance detected", time: "4 min ago" },
    { icon: "◇", text: "<b>Digital twin</b> synchronized with machine fleet", time: "8 min ago" },
  ];
  const state = {
    activeView: "overview",
    machineIndex: 0,
    metric: "temperature",
    scenario: "normal",
    elapsed: 0,
    points: 124862,
    session: 842,
    startedAt: Date.now(),
  };
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  let toastTimer;

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 2800);
  }

  function machineValue(machine, metric) {
    const base = machine[metric];
    const phase = Date.now() / 1500 + machine.id.charCodeAt(1);
    const noise = Math.sin(phase) * (metric === "vibration" ? 0.18 : 0.8);
    if (state.scenario === "overheat" && machine === machines[state.machineIndex] && metric === "temperature") return base + 18 + noise;
    if (state.scenario === "bearing" && machine === machines[state.machineIndex] && metric === "vibration") return base + 3.5 + Math.abs(noise);
    if (state.scenario === "pressure" && machine === machines[state.machineIndex] && metric === "pressure") return base + Math.sin(phase * 2) * 1.7;
    if (state.scenario === "coating" && machine === machines[state.machineIndex] && metric === "temperature") return base + Math.sin(phase * 1.7) * 5;
    return base + noise;
  }

  function hasFault(machineIndex) {
    return machineIndex === state.machineIndex && state.scenario !== "normal";
  }

  function renderMachines() {
    $("#machines").innerHTML = machines.map((machine, index) => {
      const fault = hasFault(index);
      return `<article class="machine-card">
        <div class="machine-top"><span class="machine-icon">${index < 2 ? "⬡" : "◇"}</span><span class="machine-status ${fault ? "fault" : ""}"><i></i>${fault ? "Attention" : "Operational"}</span></div>
        <h3>${machine.name}</h3><div class="machine-type">${machine.kind} · ${machine.id}</div>
        <div class="machine-readings">
          <div><span>Temperature</span><b>${machineValue(machine, "temperature").toFixed(1)} °C</b></div>
          <div><span>Pressure</span><b>${machineValue(machine, "pressure").toFixed(1)} bar</b></div>
        </div>
      </article>`;
    }).join("");
    const activeCount = machines.length;
    $("#active-count").innerHTML = `${activeCount} <em>/ ${machines.length}</em>`;
    $("#fault-count").innerHTML = `${state.scenario === "normal" ? 0 : 1} <em class="warning">${state.scenario === "normal" ? "No active faults" : "Requires attention"}</em>`;
  }

  function renderChart() {
    const machine = machines[state.machineIndex];
    const config = metricConfig[state.metric];
    const low = config.min;
    const high = config.max;
    const points = samples.map((sample, index) => {
      const wobble = Math.sin(index * 0.62 + Date.now() / 1600) * (high - low) * 0.055;
      const scenarioShift = hasFault(state.machineIndex)
        ? state.scenario === "overheat" && state.metric === "temperature" ? 12
          : state.scenario === "bearing" && state.metric === "vibration" ? 2
            : state.scenario === "pressure" && state.metric === "pressure" ? Math.sin(index * 1.4) * 1.8
              : state.scenario === "coating" && state.metric === "temperature" ? Math.sin(index * 0.9) * 4 : 0
        : 0;
      const value = Math.min(high - 0.3, Math.max(low + 0.3, machine[ state.metric ] + wobble + scenarioShift));
      return { x: (index / (samples.length - 1)) * 700, y: 150 - ((value - low) / (high - low)) * 135 };
    });
    const line = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join("");
    $("#line").setAttribute("d", line);
    $("#area").setAttribute("d", `${line} L700 160 L0 160 Z`);
    $(".axis").innerHTML = config.axis.map((value) => `<span>${value}</span>`).join("");
    $("#legend").textContent = config.label;
  }

  function renderEvents() {
    $("#events").innerHTML = events.slice(0, 4).map((event) => `
      <div class="event"><span class="event-mark ${event.warning ? "warning" : ""}">${event.icon}</span>
      <div class="event-copy">${event.text}<small>${event.time}</small></div></div>`).join("");
  }

  function updateElapsed() {
    const seconds = Math.floor((Date.now() - state.startedAt) / 1000);
    const hours = String(Math.floor(seconds / 3600)).padStart(2, "0");
    const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
    const remainder = String(seconds % 60).padStart(2, "0");
    $("#elapsed").textContent = `${hours}:${minutes}:${remainder}`;
  }

  function setView(view) {
    state.activeView = view;
    const names = {
      overview: "Overview", machines: "Machine fleet", scenarios: "Fault scenarios",
      twins: "Digital twins", maintenance: "Predictive maintenance", data: "Data explorer",
    };
    const titles = {
      overview: "Your industrial systems. Simulated in real time.",
      machines: "Monitor your connected synthetic machines.",
      scenarios: "Explore industrial fault conditions safely.",
      twins: "Digital representations of your machine fleet.",
      maintenance: "Spot maintenance signals in simulated telemetry.",
      data: "Inspect recent synthetic sensor readings.",
    };
    $$("#overview, #alternate").forEach((element) => { element.hidden = view !== "overview" ? element.id === "overview" : element.id === "alternate"; });
    $$("#title, #breadcrumb").forEach((element) => { element.textContent = names[view]; });
    $("#subtitle").textContent = titles[view];
    $$("nav button").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
    if (view !== "overview") renderAlternate(view);
  }

  function renderAlternate(view) {
    const alternate = $("#alternate");
    if (view === "machines") {
      alternate.innerHTML = `<p class="alternate-intro">All machines in this local simulation workspace.</p><div class="alternate-grid">${machines.map((machine, index) => `<article class="alternate-card"><div class="machine-status ${hasFault(index) ? "fault" : ""}"><i></i>${hasFault(index) ? "Attention" : "Operational"}</div><h3>${machine.name}</h3><p>${machine.kind}. Live synthetic readings are refreshed automatically.</p><p>Temperature: <b>${machineValue(machine, "temperature").toFixed(1)} °C</b><br>Pressure: <b>${machineValue(machine, "pressure").toFixed(1)} bar</b><br>Vibration: <b>${machineValue(machine, "vibration").toFixed(1)} mm/s</b></p><button class="primary view-machine" data-machine="${index}">View telemetry</button></article>`).join("")}</div>`;
      $$(".view-machine").forEach((button) => button.addEventListener("click", () => {
        $("#chart-machine").value = button.dataset.machine;
        state.machineIndex = Number(button.dataset.machine);
        renderChart();
        setView("overview");
        document.querySelector(".telemetry").scrollIntoView({ behavior: "smooth", block: "center" });
      }));
    } else if (view === "scenarios") {
      alternate.innerHTML = `<p class="alternate-intro">Choose a synthetic fault to see how sensor signals respond. No physical equipment is connected.</p><div class="alternate-grid">${Object.entries(scenarios).map(([key, scenario]) => `<article class="alternate-card"><h3>${scenario.label}</h3><p>${scenario.description}</p><button class="primary run-scenario" data-scenario="${key}">Run scenario</button></article>`).join("")}</div>`;
      $$(".run-scenario").forEach((button) => button.addEventListener("click", () => openSimulation(button.dataset.scenario)));
    } else if (view === "twins") {
      alternate.innerHTML = `<p class="alternate-intro">Local digital-twin representations for the current machine fleet.</p><div class="alternate-grid">${machines.map((machine, index) => `<article class="alternate-card"><div class="machine-status"><i></i> Synchronized</div><h3>${machine.name} twin</h3><p>Model type: ${machine.kind}<br>Telemetry link: Local synthetic stream<br>Last sync: Just now</p><button class="primary view-machine" data-machine="${index}">View telemetry</button></article>`).join("")}</div>`;
      $$(".view-machine").forEach((button) => button.addEventListener("click", () => {
        $("#chart-machine").value = button.dataset.machine;
        state.machineIndex = Number(button.dataset.machine);
        renderChart();
        setView("overview");
      }));
    } else if (view === "maintenance") {
      alternate.innerHTML = `<p class="alternate-intro">Maintenance indicators are illustrative and derived from this synthetic session.</p><div class="alternate-grid">${machines.map((machine, index) => `<article class="alternate-card"><div class="machine-status ${hasFault(index) ? "fault" : ""}"><i></i>${hasFault(index) ? "Inspect recommended" : "No action needed"}</div><h3>${machine.name}</h3><p>Vibration trend: ${hasFault(index) && state.scenario === "bearing" ? "Elevated" : "Stable"}<br>Temperature trend: ${hasFault(index) && state.scenario === "overheat" ? "Elevated" : "Stable"}<br>Next review: ${hasFault(index) ? "Recommended now" : "In 30 days"}</p></article>`).join("")}</div>`;
    } else {
      const rows = machines.flatMap((machine) => ["temperature", "pressure", "vibration"].map((metric) => `<tr><td>${new Date().toLocaleTimeString()}</td><td>${machine.name}</td><td>${metricConfig[metric].label}</td><td>${machineValue(machine, metric).toFixed(2)} ${metricConfig[metric].unit}</td><td>${hasFault(machines.indexOf(machine)) ? scenarios[state.scenario].label : "Normal"}</td></tr>`));
      alternate.innerHTML = `<p class="alternate-intro">Latest live synthetic sensor samples. Export data to save the current fleet snapshot as CSV.</p><div class="panel"><table class="data-table"><thead><tr><th>Timestamp</th><th>Machine</th><th>Metric</th><th>Reading</th><th>Scenario</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
    }
  }

  function openSimulation(scenario = "normal") {
    $("#scenario").value = scenario;
    $("#dialog").showModal();
  }

  function exportData() {
    const rows = [["timestamp", "machine", "metric", "value", "unit", "scenario"]];
    const timestamp = new Date().toISOString();
    machines.forEach((machine, index) => Object.entries(metricConfig).forEach(([metric, config]) => {
      rows.push([timestamp, machine.name, config.label, machineValue(machine, metric).toFixed(2), config.unit, hasFault(index) ? scenarios[state.scenario].label : "Normal"]);
    }));
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `sias-simulator-session-${state.session}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("Synthetic fleet data exported as CSV.");
  }

  $$("nav button").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  $("#chart-machine").addEventListener("change", (event) => {
    state.machineIndex = Number(event.target.value);
    renderChart();
  });
  $$("#chart-tabs button").forEach((button) => button.addEventListener("click", () => {
    state.metric = button.dataset.metric;
    $$("#chart-tabs button").forEach((tab) => tab.classList.toggle("selected", tab === button));
    renderChart();
  }));
  $("#new-sim").addEventListener("click", () => openSimulation());
  $("#close-dialog").addEventListener("click", () => $("#dialog").close());
  $("#dialog").addEventListener("click", (event) => {
    if (event.target === $("#dialog")) $("#dialog").close();
  });
  $("#simulation-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const machineIndex = Number($("#target").value);
    state.machineIndex = machineIndex;
    state.scenario = $("#scenario").value;
    state.session += 1;
    state.startedAt = Date.now();
    state.points = 0;
    $("#chart-machine").value = String(machineIndex);
    $(".status-strip .muted b").textContent = `SIM-2024-${String(state.session).padStart(4, "0")}`;
    events.unshift({
      icon: state.scenario === "normal" ? "✓" : "!",
      warning: state.scenario !== "normal",
      text: `<b>${machines[machineIndex].name}</b> · ${scenarios[state.scenario].label} started`,
      time: "Just now",
    });
    $("#dialog").close();
    renderMachines();
    renderChart();
    renderEvents();
    if (state.activeView !== "overview") renderAlternate(state.activeView);
    showToast(`${scenarios[state.scenario].label} started on ${machines[machineIndex].name}.`);
  });
  $("#export").addEventListener("click", exportData);
  $("#manage").addEventListener("click", () => setView("machines"));
  $("#help").addEventListener("click", () => showToast("All readings are synthetic; no physical machines are connected."));
  $("#all-events").addEventListener("click", () => showToast("Showing the latest activity for this local session."));

  renderMachines();
  renderChart();
  renderEvents();
  updateElapsed();
  setInterval(() => {
    state.points += Math.floor(Math.random() * 6) + 1;
    $("#points").textContent = state.points.toLocaleString();
    updateElapsed();
    renderMachines();
    renderChart();
    if (state.activeView !== "overview") renderAlternate(state.activeView);
  }, 2000);
})();
