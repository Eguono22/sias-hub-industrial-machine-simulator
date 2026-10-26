(async () => {
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
    temperature: { label: "Temperature", unit: "°C", min: 190, max: 220, axis: [220, 210, 200, 190] },
    pressure: { label: "Line pressure", unit: "bar", min: 5, max: 11, axis: [11, 9, 7, 5] },
    vibration: { label: "Vibration", unit: "mm/s", min: 0, max: 8, axis: [8, 6, 4, 2] },
  };
  const history = [];
  const events = [];
  const state = {
    activeView: "overview",
    machineIndex: 0,
    metric: "temperature",
    scenario: "normal",
    targetIndex: 0,
    speed: 1,
    paused: false,
    elapsed: 0,
    points: 0,
    session: 842,
    lastTick: Date.now(),
  };
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  let toastTimer;

  const parameters = new URLSearchParams(location.search);
  const apiBase = (parameters.get("api") || location.origin).replace(/\/$/, "");
  let apiMode = false;
  let busy = false;
  let storageKey = "sias-simulator-session-v1";

  async function apiRequest(path) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${apiBase}${path}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`API request failed (${response.status})`);
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  function setBusy(value) {
    busy = value;
    ["#new-sim", "#pause-sim", "#export", "#simulation-form button[type=submit]", "#target", "#scenario", "#speed"].forEach((selector) => { $(selector).disabled = value; });
  }

  async function initializeSource() {
    if (parameters.get("mode") !== "demo" && /^https?:/.test(apiBase)) {
      try {
        const [catalog, faults] = await Promise.all([apiRequest("/machines"), apiRequest("/fault-scenarios")]);
        if (!Array.isArray(catalog.machines) || !catalog.machines.length || !faults.fault_scenarios?.normal) throw new Error("Invalid API catalog");
        const fleet = catalog.machines.map((machine) => {
          if (!["id", "name", "type"].every((key) => typeof machine[key] === "string")
            || !["temperature_c", "pressure_bar", "vibration_mm_s"].every((key) => Number.isFinite(machine.baseline?.[key]))) throw new Error("Invalid machine model");
          return { id: machine.id, name: machine.name, kind: machine.type, temperature: machine.baseline.temperature_c, pressure: machine.baseline.pressure_bar, vibration: machine.baseline.vibration_mm_s };
        });
        const faultOptions = Object.fromEntries(Object.entries(faults.fault_scenarios).map(([key, value]) => {
          if (typeof value.description !== "string") throw new Error("Invalid scenario");
          return [key, { label: key.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()), description: value.description }];
        }));
        machines.splice(0, machines.length, ...fleet);
        Object.keys(scenarios).forEach((key) => delete scenarios[key]);
        Object.assign(scenarios, faultOptions);
        apiMode = true;
        storageKey = `sias-simulator-api-v1:${apiBase}:${machines.map((machine) => machine.id).join(",")}`;
      } catch {
        showToast("API unavailable. Browser demo mode is active.");
      }
    }
    $("#source-mode").value = apiMode ? "api" : "demo";
    $("#source-description").textContent = apiMode ? "FastAPI · synthetic telemetry" : "Browser demo · synthetic telemetry";
    const options = machines.map((machine, index) => `<option value="${index}">${escapeText(machine.name)}</option>`).join("");
    $("#chart-machine").innerHTML = options;
    $("#target").innerHTML = options;
    $("#scenario").innerHTML = Object.entries(scenarios).map(([key, scenario]) => `<option value="${escapeText(key)}">${escapeText(scenario.label)}</option>`).join("");
    $("nav [data-view=machines] b").textContent = machines.length;
    $(".section-heading h2 span").textContent = `${machines.length} machines`;
  }

  async function fetchFleet(start, count, targetIndex = state.targetIndex, scenario = state.scenario) {
    const query = new URLSearchParams({ target: machines[targetIndex].id, scenario, start, count });
    const data = await apiRequest(`/fleet/telemetry?${query}`);
    if (!Array.isArray(data.samples) || data.samples.length !== count) throw new Error("Invalid telemetry batch");
    return data.samples.map((sample, index) => {
      if (sample.elapsed !== start + index || !Number.isFinite(Date.parse(sample.timestamp)) || !Array.isArray(sample.readings)
        || sample.readings.length !== machines.length) throw new Error("Invalid telemetry sample");
      const readings = machines.map((machine) => {
        const reading = sample.readings.find((value) => value.machine_id === machine.id);
        if (!reading || !["temperature_c", "pressure_bar", "vibration_mm_s", "health_score"].every((key) => Number.isFinite(reading[key]))) throw new Error("Missing sensor reading");
        return { temperature: reading.temperature_c, pressure: reading.pressure_bar, vibration: reading.vibration_mm_s, health: reading.health_score };
      });
      return { elapsed: sample.elapsed, timestamp: sample.timestamp, readings };
    });
  }

  function appendFleet(samples) {
    history.push(...samples);
    state.elapsed = samples.at(-1).elapsed;
    while (history.length && history[0].elapsed < state.elapsed - 60) history.shift();
    state.points = (state.elapsed + 1) * machines.length * Object.keys(metricConfig).length;
  }

  function connectionFailed() {
    state.paused = true;
    state.lastTick = Date.now();
    renderRunState();
    addEvent("API connection lost. Simulation paused; resume to retry.", true);
    showToast("API unavailable. Simulation paused. Resume to retry.");
  }

  function saveSession() {
    try {
      const { lastTick, ...savedState } = state;
      localStorage.setItem(storageKey, JSON.stringify({ version: 1, state: savedState, history, events }));
      $("#save-status").textContent = "Saved on this device";
    } catch {
      $("#save-status").textContent = "Session saving unavailable";
    }
  }

  function restoreSession() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (!saved || saved.version !== 1) return false;
      const value = saved.state;
      const validIndex = (index) => Number.isInteger(index) && index >= 0 && index < machines.length;
      const validCount = (count) => Number.isSafeInteger(count) && count >= 0;
      if (!value || !validIndex(value.machineIndex) || !validIndex(value.targetIndex)
        || !Object.hasOwn(scenarios, value.scenario) || !Object.hasOwn(metricConfig, value.metric)
        || ![1, 5, 10].includes(value.speed) || typeof value.paused !== "boolean"
        || !validCount(value.elapsed) || !validCount(value.points) || !validCount(value.session)
        || !["overview", "machines", "scenarios", "twins", "maintenance", "data"].includes(value.activeView)
        || !Array.isArray(saved.history) || !saved.history.length || saved.history.length > 61) return false;
      let previous = -1;
      for (const sample of saved.history) {
        if (!sample || !validCount(sample.elapsed) || sample.elapsed <= previous
          || sample.elapsed > value.elapsed || sample.elapsed < value.elapsed - 60
          || typeof sample.timestamp !== "string" || !Number.isFinite(Date.parse(sample.timestamp))
          || !Array.isArray(sample.readings) || sample.readings.length !== machines.length
          || !sample.readings.every((readings) => readings && (!apiMode || Number.isFinite(readings.health)) && Object.keys(metricConfig).every((metric) => Number.isFinite(readings[metric])))) return false;
        previous = sample.elapsed;
      }
      if (previous !== value.elapsed || value.points !== (value.elapsed + 1) * machines.length * Object.keys(metricConfig).length) return false;
      for (const key of Object.keys(state)) {
        if (key !== "lastTick") state[key] = value[key];
      }
      history.push(...saved.history);
      if (Array.isArray(saved.events)) {
        events.push(...saved.events.filter((event) => event && typeof event.text === "string"
          && event.text.length <= 500 && typeof event.timestamp === "string"
          && Number.isFinite(Date.parse(event.timestamp)) && validCount(event.session)
          && typeof event.warning === "boolean").slice(0, 100).map((event) => ({
            text: event.text, timestamp: event.timestamp, session: event.session, warning: event.warning,
          })));
      }
      state.lastTick = Date.now();
      return true;
    } catch {
      return false;
    }
  }

  function renderRunState() {
    $("#pause-sim").textContent = state.paused ? "▶ Resume" : "Ⅱ Pause";
    $("#pause-sim").setAttribute("aria-pressed", String(state.paused));
    $("#run-status").textContent = state.paused ? "Simulation paused" : `Simulation running · ${state.speed}×`;
    $("#stream-status").textContent = state.paused ? "PAUSED" : "LIVE DATA";
    $(".status-strip").classList.toggle("paused", state.paused);
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 2800);
  }

  function machineValue(machine, metric) {
    if (apiMode && history.length) return history.at(-1).readings[machines.indexOf(machine)][metric];
    const base = machine[metric];
    const phase = state.elapsed / 1.5 + machines.indexOf(machine);
    const noise = Math.sin(phase) * (metric === "vibration" ? 0.18 : 0.8);
    if (state.scenario === "overheat" && machine === machines[state.targetIndex] && metric === "temperature") return base + 18 + noise;
    if (state.scenario === "bearing" && machine === machines[state.targetIndex] && metric === "vibration") return base + 3.5 + Math.abs(noise);
    if (state.scenario === "pressure" && machine === machines[state.targetIndex] && metric === "pressure") return base + Math.sin(phase * 2) * 1.7;
    if (state.scenario === "coating" && machine === machines[state.targetIndex] && metric === "temperature") return base + Math.sin(phase * 1.7) * 5;
    return base + noise;
  }

  function hasFault(machineIndex) {
    return machineIndex === state.targetIndex && state.scenario !== "normal";
  }

  function renderMachines() {
    $("#machines").innerHTML = machines.map((machine, index) => {
      const fault = hasFault(index);
      return `<article class="machine-card">
        <div class="machine-top"><span class="machine-icon">${index < 2 ? "⬡" : "◇"}</span><span class="machine-status ${fault ? "fault" : ""}"><i></i>${fault ? "Attention" : "Operational"}</span></div>
        <h3>${escapeText(machine.name)}</h3><div class="machine-type">${escapeText(machine.kind)} · ${escapeText(machine.id)}</div>
        <div class="machine-readings">
          <div><span>Temperature</span><b>${machineValue(machine, "temperature").toFixed(1)} °C</b></div>
          <div><span>Pressure</span><b>${machineValue(machine, "pressure").toFixed(1)} bar</b></div>
        </div>
      </article>`;
    }).join("");
    $("#fault-summary").textContent = state.scenario === "normal" ? "Across 0 machines" : "Across 1 machine";
    const health = apiMode ? (history.at(-1).readings.reduce((sum, reading) => sum + reading.health, 0) / machines.length).toFixed(1) : state.scenario === "normal" ? "100" : "87.5";
    $("#health").innerHTML = `${health} <em>%</em>`;
    $("#points").textContent = state.points.toLocaleString();
    const activeCount = machines.length;
    $("#active-count").innerHTML = `${activeCount} <em>/ ${machines.length}</em>`;
    $("#fault-count").innerHTML = `${state.scenario === "normal" ? 0 : 1} <em class="warning">${state.scenario === "normal" ? "No active faults" : "Requires attention"}</em>`;
  }

  function collectSample() {
    const readings = machines.map((machine) => Object.fromEntries(
      Object.keys(metricConfig).map((metric) => [metric, machineValue(machine, metric)])
    ));
    history.push({ elapsed: state.elapsed, timestamp: new Date().toISOString(), readings });
    while (history.length && state.elapsed - history[0].elapsed > 60) history.shift();
    state.points += machines.length * Object.keys(metricConfig).length;
  }

  function renderChart() {
    const config = metricConfig[state.metric];
    const values = history.map((sample) => sample.readings[state.machineIndex][state.metric]);
    const low = Math.min(apiMode ? Infinity : config.min, ...values.map((value) => Math.floor(value - 1)));
    const high = Math.max(apiMode ? -Infinity : config.max, ...values.map((value) => Math.ceil(value + 1)));
    const points = history.map((sample) => ({
      x: (1 - (state.elapsed - sample.elapsed) / 60) * 700,
      y: 150 - ((sample.readings[state.machineIndex][state.metric] - low) / (high - low)) * 135,
    }));
    const line = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join("");
    $("#line").setAttribute("d", line);
    $("#area").setAttribute("d", points.length ? `${line} L700 160 L${points[0].x.toFixed(1)} 160 Z` : "");
    $(".axis").innerHTML = Array.from({ length: 4 }, (_, index) => `<span>${(high - index * (high - low) / 3).toFixed(1)}</span>`).join("");
    $("#legend").textContent = config.label;
    $("#chart").setAttribute("aria-label", `${machines[state.machineIndex].name}: ${config.label}, latest ${values.at(-1)?.toFixed(1)} ${config.unit}`);
  }

  function escapeText(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }

  function eventMarkup(event) {
    const timestamp = escapeText(event.timestamp);
    return `<div class="event"><span class="event-mark ${event.warning ? "warning" : ""}" aria-label="${event.warning ? "Warning" : "Information"}">${event.warning ? "!" : "✓"}</span>
      <div class="event-copy">${escapeText(event.text)}<small><time datetime="${timestamp}">${escapeText(new Date(event.timestamp).toLocaleString())}</time> · Session ${event.session}</small></div></div>`;
  }

  function addEvent(text, warning = false) {
    events.unshift({ text, warning, timestamp: new Date().toISOString(), session: state.session });
    events.length = Math.min(events.length, 100);
    renderEvents();
    if ($("#activity-dialog").open) renderActivity();
    saveSession();
  }

  function renderEvents() {
    $("#events").innerHTML = events.slice(0, 4).map(eventMarkup).join("");
  }

  function renderActivity() {
    const visible = events.filter((event) => $("#activity-filter").value !== "warnings" || event.warning);
    $("#activity-count").textContent = `${visible.length} of ${events.length} events · Latest 100 retained on this device`;
    $("#activity-list").innerHTML = visible.length ? visible.map(eventMarkup).join("") : '<p class="activity-empty">No warning events recorded.</p>';
  }

  function updateElapsed() {
    const seconds = Math.floor(state.elapsed);
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
    saveSession();
  }

  function renderAlternate(view) {
    const alternate = $("#alternate");
    if (view === "machines") {
      alternate.innerHTML = `<p class="alternate-intro">All machines in this local simulation workspace.</p><div class="alternate-grid">${machines.map((machine, index) => `<article class="alternate-card"><div class="machine-status ${hasFault(index) ? "fault" : ""}"><i></i>${hasFault(index) ? "Attention" : "Operational"}</div><h3>${escapeText(machine.name)}</h3><p>${escapeText(machine.kind)}. Live synthetic readings are refreshed automatically.</p><p>Temperature: <b>${machineValue(machine, "temperature").toFixed(1)} °C</b><br>Pressure: <b>${machineValue(machine, "pressure").toFixed(1)} bar</b><br>Vibration: <b>${machineValue(machine, "vibration").toFixed(1)} mm/s</b></p><button class="primary view-machine" data-machine="${index}">View telemetry</button></article>`).join("")}</div>`;
      $$(".view-machine").forEach((button) => button.addEventListener("click", () => {
        $("#chart-machine").value = button.dataset.machine;
        state.machineIndex = Number(button.dataset.machine);
        renderChart();
        setView("overview");
        document.querySelector(".telemetry").scrollIntoView({ behavior: "smooth", block: "center" });
      }));
    } else if (view === "scenarios") {
      alternate.innerHTML = `<p class="alternate-intro">Choose a synthetic fault to see how sensor signals respond. No physical equipment is connected.</p><div class="alternate-grid">${Object.entries(scenarios).map(([key, scenario]) => `<article class="alternate-card"><h3>${escapeText(scenario.label)}</h3><p>${escapeText(scenario.description)}</p><button class="primary run-scenario" data-scenario="${key}">Run scenario</button></article>`).join("")}</div>`;
      $$(".run-scenario").forEach((button) => button.addEventListener("click", () => openSimulation(button.dataset.scenario)));
    } else if (view === "twins") {
      alternate.innerHTML = `<p class="alternate-intro">Local digital-twin representations for the current machine fleet.</p><div class="alternate-grid">${machines.map((machine, index) => `<article class="alternate-card"><div class="machine-status"><i></i> Synchronized</div><h3>${escapeText(machine.name)} twin</h3><p>Model type: ${escapeText(machine.kind)}<br>Telemetry link: ${apiMode ? "FastAPI synthetic stream" : "Browser synthetic stream"}<br>Last sync: ${escapeText(new Date(history.at(-1).timestamp).toLocaleTimeString())}</p><button class="primary view-machine" data-machine="${index}">View telemetry</button></article>`).join("")}</div>`;
      $$(".view-machine").forEach((button) => button.addEventListener("click", () => {
        $("#chart-machine").value = button.dataset.machine;
        state.machineIndex = Number(button.dataset.machine);
        renderChart();
        setView("overview");
      }));
    } else if (view === "maintenance") {
      alternate.innerHTML = `<p class="alternate-intro">Maintenance indicators are illustrative and derived from this synthetic session.</p><div class="alternate-grid">${machines.map((machine, index) => `<article class="alternate-card"><div class="machine-status ${hasFault(index) ? "fault" : ""}"><i></i>${hasFault(index) ? "Inspect recommended" : "No action needed"}</div><h3>${escapeText(machine.name)}</h3><p>Vibration trend: ${machineValue(machine, "vibration") > machine.vibration + 0.5 ? "Elevated" : "Stable"}<br>Temperature trend: ${machineValue(machine, "temperature") > machine.temperature + 2 ? "Elevated" : "Stable"}<br>Next review: ${hasFault(index) ? "Recommended now" : "In 30 days"}</p></article>`).join("")}</div>`;
    } else {
      const rows = machines.flatMap((machine) => ["temperature", "pressure", "vibration"].map((metric) => `<tr><td>${new Date(history.at(-1).timestamp).toLocaleTimeString()}</td><td>${escapeText(machine.name)}</td><td>${metricConfig[metric].label}</td><td>${machineValue(machine, metric).toFixed(2)} ${metricConfig[metric].unit}</td><td>${hasFault(machines.indexOf(machine)) ? scenarios[state.scenario].label : "Normal"}</td></tr>`));
      alternate.innerHTML = `<p class="alternate-intro">Latest live synthetic sensor samples. Export data to save the current fleet snapshot as CSV.</p><div class="panel"><table class="data-table"><thead><tr><th>Timestamp</th><th>Machine</th><th>Metric</th><th>Reading</th><th>Scenario</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
    }
  }

  function openSimulation(scenario = "normal") {
    $("#scenario").value = scenario;
    $("#target").value = String(state.targetIndex);
    $("#speed").value = String(state.speed);
    $("#dialog").showModal();
  }

  function exportData() {
    const rows = [["timestamp", "machine", "metric", "value", "unit", "scenario"]];
    const timestamp = history.at(-1).timestamp;
    machines.forEach((machine, index) => Object.entries(metricConfig).forEach(([metric, config]) => {
      rows.push([timestamp, machine.name, config.label, history.at(-1).readings[index][metric].toFixed(2), config.unit, hasFault(index) ? scenarios[state.scenario].label : "Normal"]);
    }));
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `sias-simulator-session-${state.session}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    addEvent("Synthetic fleet snapshot exported as CSV");
    showToast("Synthetic fleet data exported as CSV.");
  }

  setBusy(true);
  await initializeSource();
  $("#source-mode").addEventListener("change", (event) => {
    parameters.set("mode", event.target.value);
    location.search = parameters.toString();
  });

  $$("nav button").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  $("#chart-machine").addEventListener("change", (event) => {
    state.machineIndex = Number(event.target.value);
    renderChart();
    saveSession();
  });
  $$("#chart-tabs button").forEach((button) => button.addEventListener("click", () => {
    state.metric = button.dataset.metric;
    $$("#chart-tabs button").forEach((tab) => tab.classList.toggle("selected", tab === button));
    renderChart();
    saveSession();
  }));
  $("#new-sim").addEventListener("click", () => openSimulation());
  $("#close-dialog").addEventListener("click", () => $("#dialog").close());
  $("#dialog").addEventListener("click", (event) => {
    if (event.target === $("#dialog")) $("#dialog").close();
  });
  $("#simulation-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    const machineIndex = Number($("#target").value);
    const scenario = $("#scenario").value;
    let firstSamples;
    if (apiMode) {
      setBusy(true);
      try { firstSamples = await fetchFleet(0, 1, machineIndex, scenario); }
      catch { connectionFailed(); return; }
      finally { setBusy(false); }
    }
    state.machineIndex = machineIndex;
    state.targetIndex = machineIndex;
    state.speed = Number($("#speed").value);
    state.scenario = $("#scenario").value;
    state.session += 1;
    state.paused = false;
    state.elapsed = 0;
    state.lastTick = Date.now();
    state.points = 0;
    history.length = 0;
    if (apiMode) appendFleet(firstSamples);
    else collectSample();
    updateElapsed();
    $("#chart-machine").value = String(machineIndex);
    $(".status-strip .muted b").textContent = `SIM-${new Date().getFullYear()}-${String(state.session).padStart(4, "0")}`;
    addEvent(`${machines[machineIndex].name} · ${scenarios[state.scenario].label} started at ${state.speed}× speed`, state.scenario !== "normal");
    $("#dialog").close();
    renderRunState();
    saveSession();
    renderMachines();
    renderChart();
    renderEvents();
    if (state.activeView !== "overview") renderAlternate(state.activeView);
    showToast(`${scenarios[state.scenario].label} started on ${machines[machineIndex].name}.`);
  });
  $("#export").addEventListener("click", exportData);
  $("#manage").addEventListener("click", () => setView("machines"));
  $("#help").addEventListener("click", () => showToast("All readings are synthetic; no physical machines are connected."));
  $("#all-events").addEventListener("click", () => {
    renderActivity();
    $("#activity-dialog").showModal();
  });
  $("#activity-filter").addEventListener("change", renderActivity);
  $("#close-activity").addEventListener("click", () => $("#activity-dialog").close());
  $("#activity-dialog").addEventListener("click", (event) => {
    if (event.target === $("#activity-dialog")) $("#activity-dialog").close();
  });

  const restored = restoreSession();
  if (!restored) {
    if (apiMode) {
      try { appendFleet(await fetchFleet(0, 1)); }
      catch {
        // Keep the selected API source; no browser readings are substituted.
        $("#source-description").textContent = "API unavailable · choose Browser demo or reload to retry";
        $("#run-status").textContent = "Unable to load API telemetry";
        $("#stream-status").textContent = "OFFLINE";
        $("#save-status").textContent = "No API readings received";
        $$("nav button").forEach((button) => { button.disabled = true; });
        $("#overview").hidden = true;
        $("#alternate").hidden = false;
        $("#alternate").innerHTML = '<article class="alternate-card"><h3>API telemetry unavailable</h3><p>Reload to retry, or choose Browser demo from Data source to continue locally.</p></article>';
        return;
      }
    } else collectSample();
  }
  addEvent(restored ? "Session restored from this device" : "Simulation engine started generating synthetic telemetry");
  $(".status-strip .muted b").textContent = `SIM-${new Date().getFullYear()}-${String(state.session).padStart(4, "0")}`;
  $("#chart-machine").value = String(state.machineIndex);
  $$("#chart-tabs button").forEach((tab) => tab.classList.toggle("selected", tab.dataset.metric === state.metric));
  renderRunState();
  renderMachines();
  renderChart();
  renderEvents();
  updateElapsed();
  setView(state.activeView);
  setBusy(false);

  async function advanceSimulation() {
    if (busy) return;
    const now = Date.now();
    if (state.paused) {
      state.lastTick = now;
      return;
    }
    const steps = Math.floor((now - state.lastTick) / 1000);
    if (!steps) return;
    state.lastTick += steps * 1000;
    const totalSteps = steps * state.speed;
    const skippedSteps = Math.max(0, totalSteps - 60);
    if (apiMode) {
      setBusy(true);
      try { appendFleet(await fetchFleet(state.elapsed + skippedSteps + 1, Math.min(totalSteps, 60))); }
      catch { connectionFailed(); return; }
      finally { setBusy(false); }
    } else {
      state.elapsed += skippedSteps;
      state.points += skippedSteps * machines.length * Object.keys(metricConfig).length;
      for (let step = 0; step < Math.min(totalSteps, 60); step += 1) {
        state.elapsed += 1;
        collectSample();
      }
    }
    updateElapsed();
    renderMachines();
    renderChart();
    if (state.activeView !== "overview") renderAlternate(state.activeView);
    saveSession();
  }

  $("#pause-sim").addEventListener("click", () => {
    if (busy) return;
    state.paused = !state.paused;
    addEvent(state.paused ? "Simulation paused" : "Simulation resumed");
    state.lastTick = Date.now();
    renderRunState();
    saveSession();
    showToast(state.paused ? "Simulation paused. Readings are frozen for inspection." : "Simulation resumed.");
  });
  window.addEventListener("pagehide", saveSession);
  setInterval(advanceSimulation, 1000);
})();
