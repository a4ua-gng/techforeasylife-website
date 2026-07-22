"use strict";

const controlApp = document.querySelector("[data-control-app]");

if (controlApp) {
  const gate = document.querySelector("[data-control-gate]");
  let accessGranted = false;
  try { accessGranted = window.sessionStorage.getItem("telSafeFlightDemoPassed") === "1"; } catch (error) { accessGranted = false; }
  gate.hidden = accessGranted;

  const state = {
    weatherChecked: false,
    weatherLevel: "neutral",
    checks: new Set(),
    running: false,
    completed: false,
    timer: null
  };

  const checks = [...document.querySelectorAll("[data-control-check]")];
  const checkCount = document.querySelector("[data-control-check-count]");
  const checkStatus = document.querySelector("[data-control-check-status]");
  const startButton = document.querySelector("[data-control-start]");
  const stopButton = document.querySelector("[data-control-stop]");
  const countDisplay = document.querySelector("[data-control-count]");
  const missionState = document.querySelector("[data-control-state]");
  const missionProgress = document.querySelector("[data-control-progress]");
  const missionMessage = document.querySelector("[data-control-message]");
  const certificateButton = document.querySelector("[data-control-certificate]");
  const logList = document.querySelector("[data-control-log]");

  function log(message) {
    const item = document.createElement("li");
    const time = document.createElement("time");
    const text = document.createElement("span");
    time.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    text.textContent = message;
    item.append(time, text);
    if (logList.children.length === 1 && logList.textContent.includes("Waiting")) logList.innerHTML = "";
    logList.prepend(item);
  }

  function updateAvailability() {
    const checklistComplete = state.checks.size === checks.length;
    const blocked = state.weatherLevel === "red";
    const ready = accessGranted && state.weatherChecked && checklistComplete && !blocked && !state.running;
    startButton.disabled = !ready;
    checkCount.textContent = `${state.checks.size}/${checks.length}`;
    if (blocked) {
      checkStatus.textContent = "Red weather status: the classroom countdown is blocked.";
      missionState.textContent = "RED STATUS // DO NOT PROCEED";
      missionMessage.textContent = "The weather advisory has stopped this demonstration. Follow the mentor and local alerts.";
    } else if (!state.weatherChecked) {
      checkStatus.textContent = `${state.checks.size}/${checks.length} confirmed. A weather check is still required.`;
      missionState.textContent = "WEATHER CHECK REQUIRED";
    } else if (!checklistComplete) {
      checkStatus.textContent = `${state.checks.size}/${checks.length} confirmed with the mentor.`;
      missionState.textContent = "MENTOR CHECKLIST INCOMPLETE";
    } else if (!state.running && !state.completed) {
      checkStatus.textContent = "Mentor checklist complete. Classroom countdown available.";
      missionState.textContent = state.weatherLevel === "yellow" ? "CAUTION REVIEWED // MENTOR DECISION" : "READY FOR CLASSROOM SIMULATION";
      missionMessage.textContent = "This is a communication exercise only and does not control physical equipment.";
    }
  }

  checks.forEach((button) => {
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
      const id = button.dataset.controlCheck;
      const selected = !button.classList.contains("selected");
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
      if (selected) state.checks.add(id);
      else state.checks.delete(id);
      log(`${button.querySelector("strong").textContent}: ${selected ? "confirmed" : "reopened"}.`);
      updateAvailability();
    });
  });

  const weatherCard = document.querySelector("[data-control-weather-status]");
  const advisory = document.querySelector("[data-control-advisory]");
  const suggestion = document.querySelector("[data-control-suggestion]");
  const weatherLocation = document.querySelector("[data-control-weather-location]");
  const weatherMetrics = document.querySelector("[data-control-weather-metrics]");
  const cityInput = document.querySelector("[data-control-city]");

  function weatherLabel(code) {
    if (code === 0) return "Clear";
    if ([1, 2, 3].includes(code)) return "Cloudy";
    if ([45, 48].includes(code)) return "Fog";
    if (code >= 51 && code <= 67) return "Rain";
    if (code >= 71 && code <= 77) return "Snow";
    if (code >= 80 && code <= 82) return "Showers";
    if (code >= 85 && code <= 86) return "Snow showers";
    if (code >= 95) return "Thunderstorm";
    return "Reported";
  }

  function classifyWeather(current) {
    const code = Number(current.weather_code ?? 0);
    const gust = Number(current.wind_gusts_10m ?? 0);
    const precipitation = Number(current.precipitation ?? 0);
    const visibility = Number(current.visibility ?? 99999);
    if (code >= 95 || visibility < 3000 || gust >= 35 || precipitation >= 2) {
      return { level: "red", title: "RED // DO NOT PROCEED", suggestion: "Stop the demonstration and follow the mentor, institution plan and official local alerts." };
    }
    if (code >= 45 || gust >= 20 || precipitation > 0 || visibility < 8000) {
      return { level: "yellow", title: "YELLOW // CAUTION — ASK MENTOR", suggestion: "Pause and ask the mentor to reassess current wind, visibility and local conditions." };
    }
    return { level: "green", title: "GREEN // NO AUTOMATIC CAUTION", suggestion: "No automatic weather caution was detected. Mentor approval and local observation are still required." };
  }

  function renderWeather(current, placeName) {
    const assessment = classifyWeather(current);
    state.weatherChecked = true;
    state.weatherLevel = assessment.level;
    weatherCard.className = `weather-status ${assessment.level}`;
    advisory.textContent = assessment.title;
    suggestion.textContent = assessment.suggestion;
    weatherLocation.textContent = placeName;
    weatherMetrics.innerHTML = `
      <div class="weather-metric"><small>Wind</small><b>${Math.round(Number(current.wind_speed_10m))} km/h</b></div>
      <div class="weather-metric"><small>Gusts</small><b>${Math.round(Number(current.wind_gusts_10m))} km/h</b></div>
      <div class="weather-metric"><small>Visibility</small><b>${Math.max(0, Number(current.visibility) / 1000).toFixed(1)} km</b></div>
      <div class="weather-metric"><small>Condition</small><b>${weatherLabel(Number(current.weather_code))}</b></div>`;
    log(`Weather loaded for ${placeName}: ${assessment.title}.`);
    updateAvailability();
  }

  function weatherFallback(message) {
    state.weatherChecked = true;
    state.weatherLevel = "yellow";
    weatherCard.className = "weather-status yellow";
    advisory.textContent = "YELLOW // LIVE DATA UNAVAILABLE";
    suggestion.textContent = `${message} Ask the mentor to use an approved local weather source.`;
    log("Live weather unavailable; mentor review required.");
    updateAvailability();
  }

  async function loadWeather(latitude, longitude, placeName) {
    advisory.textContent = "CHECKING CURRENT CONDITIONS…";
    suggestion.textContent = "Contacting the weather service.";
    try {
      const params = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        current: "temperature_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,visibility",
        timezone: "auto"
      });
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
      if (!response.ok) throw new Error("Weather service unavailable");
      const data = await response.json();
      renderWeather(data.current, placeName);
    } catch (error) {
      weatherFallback("Current conditions could not be loaded.");
    }
  }

  document.querySelector("[data-control-weather-search]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const city = cityInput.value.trim();
    if (!city) return;
    advisory.textContent = "FINDING LOCATION…";
    try {
      const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`);
      if (!response.ok) throw new Error("Location unavailable");
      const data = await response.json();
      const result = data.results?.[0];
      if (!result) throw new Error("Location not found");
      const placeName = [result.name, result.admin1, result.country].filter(Boolean).join(", ");
      await loadWeather(result.latitude, result.longitude, placeName);
    } catch (error) {
      weatherFallback("That location could not be loaded.");
    }
  });

  document.querySelector("[data-control-location]")?.addEventListener("click", () => {
    if (!("geolocation" in navigator)) {
      weatherFallback("Location services are not available.");
      return;
    }
    advisory.textContent = "REQUESTING LOCATION…";
    navigator.geolocation.getCurrentPosition(
      (position) => loadWeather(position.coords.latitude, position.coords.longitude, "Current location"),
      () => weatherFallback("Location was not shared."),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  });

  let cueContext = null;

  function playCue(final = false) {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!cueContext || cueContext.state === "closed") cueContext = new AudioContext();
      if (cueContext.state === "suspended") cueContext.resume().catch(() => {});
      const oscillator = cueContext.createOscillator();
      const gain = cueContext.createGain();
      oscillator.frequency.value = final ? 690 : 430;
      gain.gain.setValueAtTime(.0001, cueContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(.11, cueContext.currentTime + .01);
      gain.gain.exponentialRampToValueAtTime(.0001, cueContext.currentTime + .11);
      oscillator.connect(gain).connect(cueContext.destination);
      oscillator.start();
      oscillator.stop(cueContext.currentTime + .13);
    } catch (error) { /* Visual countdown remains available without audio. */ }
  }

  function pauseCountdown(message = "SIMULATION PAUSED") {
    window.clearInterval(state.timer);
    state.timer = null;
    state.running = false;
    countDisplay.textContent = "—";
    missionState.textContent = message;
    missionProgress.style.width = "0%";
    log("Classroom countdown paused.");
    updateAvailability();
  }

  startButton.addEventListener("click", () => {
    if (startButton.disabled || state.running) return;
    let value = 10;
    state.running = true;
    state.completed = false;
    certificateButton.disabled = true;
    startButton.disabled = true;
    countDisplay.textContent = String(value);
    missionState.textContent = "CLASSROOM COMMUNICATION COUNTDOWN";
    missionMessage.textContent = "This simulation does not connect to or activate physical equipment.";
    missionProgress.style.width = "0%";
    log("Classroom countdown started by the user after mentor checks.");
    playCue();
    state.timer = window.setInterval(() => {
      value -= 1;
      if (value > 0) {
        countDisplay.textContent = String(value);
        missionProgress.style.width = `${((10 - value) / 10) * 100}%`;
        playCue();
        return;
      }
      window.clearInterval(state.timer);
      state.timer = null;
      state.running = false;
      state.completed = true;
      countDisplay.textContent = "CHECK";
      missionState.textContent = "DEMO COMPLETE // AWAIT MENTOR DIRECTION";
      missionProgress.style.width = "100%";
      missionMessage.textContent = "Classroom communication exercise complete. This is not practical authorization.";
      certificateButton.disabled = false;
      playCue(true);
      log("Classroom countdown demonstration completed.");
      updateAvailability();
    }, 1000);
  });

  stopButton.addEventListener("click", () => pauseCountdown());

  function pdfEscape(value) {
    return String(value).replace(/[^\x20-\x7E]/g, "").replace(/([\\()])/g, "\\$1");
  }

  function certificatePdf(name) {
    const date = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
    const content = [
      "q 0.07 0.06 0.11 rg 0 0 595 842 re f Q",
      "q 0.80 0.74 1.00 RG 3 w 42 42 511 758 re S Q",
      "BT /F1 12 Tf 0.80 0.74 1.00 rg 72 746 Td (TECH FOR EASY LIFE) Tj ET",
      "BT /F1 31 Tf 1 1 1 rg 72 680 Td (TEL CONTROL) Tj ET",
      "BT /F1 17 Tf 1 1 1 rg 72 646 Td (SafeFlight Learning Certificate) Tj ET",
      "BT /F1 13 Tf 0.72 0.72 0.78 rg 72 580 Td (Presented to) Tj ET",
      `BT /F1 25 Tf 1 1 1 rg 72 538 Td (${pdfEscape(name)}) Tj ET`,
      "BT /F1 12 Tf 0.72 0.72 0.78 rg 72 492 Td (Completed the TEL SafeFlight classroom demonstration.) Tj ET",
      `BT /F1 11 Tf 0.80 0.74 1.00 rg 72 438 Td (Date: ${pdfEscape(date)}) Tj ET`,
      "BT /F1 9 Tf 0.60 0.60 0.66 rg 72 118 Td (Learning record only. This certificate is not practical authorization.) Tj ET",
      "BT /F1 9 Tf 0.60 0.60 0.66 rg 72 98 Td (Adult supervision and institution approval remain required.) Tj ET"
    ].join("\n");
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      `<< /Length ${new TextEncoder().encode(content).length} >>\nstream\n${content}\nendstream`
    ];
    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets[index + 1] = new TextEncoder().encode(pdf).length;
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xref = new TextEncoder().encode(pdf).length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return new Blob([pdf], { type: "application/pdf" });
  }

  certificateButton.addEventListener("click", () => {
    const nameInput = document.querySelector("[data-control-name]");
    const name = nameInput.value.trim();
    if (!state.completed) {
      missionMessage.textContent = "Complete the classroom demonstration before downloading the certificate.";
      return;
    }
    if (name.length < 2) {
      missionMessage.textContent = "Enter the learner's name for the certificate.";
      nameInput.focus();
      return;
    }
    const url = URL.createObjectURL(certificatePdf(name));
    const link = document.createElement("a");
    link.href = url;
    link.download = `TEL-Control-${name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}.pdf`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    missionMessage.textContent = "Learning certificate downloaded.";
    log("Learning certificate downloaded.");
  });

  log(accessGranted ? "SafeFlight learning token accepted." : "SafeFlight learning token missing.");
  updateAvailability();
}
