"use strict";

const safeFlight = document.querySelector("[data-safeflight]");

if (safeFlight) {
  const state = {
    serial: "",
    accessComplete: false,
    modules: new Set(),
    conditions: new Set(),
    quizPassed: false,
    missionComplete: false,
    quizQuestions: [],
    quizIndex: 0,
    quizScore: 0,
    quizAnswered: false,
    countdownTimer: null
  };

  const stages = [...safeFlight.querySelectorAll("[data-sf-stage]")];
  const stepChips = [...safeFlight.querySelectorAll("[data-sf-step-chip]")];
  const progressBar = safeFlight.querySelector("[data-sf-progress]");
  const progressText = safeFlight.querySelector("[data-sf-progress-text]");

  const stageComplete = [
    () => state.accessComplete,
    () => state.modules.size === safeFlight.querySelectorAll("[data-sf-module]").length,
    () => state.conditions.size === safeFlight.querySelectorAll("[data-sf-check]").length,
    () => state.quizPassed,
    () => state.missionComplete
  ];

  function updateProgress() {
    const completed = stageComplete.filter((check) => check()).length;
    const percent = (completed / stageComplete.length) * 100;
    progressBar.style.width = `${percent}%`;
    progressText.textContent = `${completed} of ${stageComplete.length} checkpoints complete`;
    stepChips.forEach((chip, index) => {
      const complete = stageComplete[index]();
      const active = !complete && (index === 0 || stageComplete[index - 1]());
      chip.classList.toggle("complete", complete);
      chip.classList.toggle("active", active);
      const marker = chip.querySelector("i");
      if (marker) marker.textContent = complete ? "✓" : String(index + 1).padStart(2, "0");
    });
  }

  function showStage(name, shouldScroll = true) {
    const stage = stages.find((item) => item.dataset.sfStage === name);
    if (!stage) return;
    stage.hidden = false;
    if (shouldScroll) {
      stage.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    }
  }

  const serialForm = safeFlight.querySelector("[data-sf-serial-form]");
  const serialInput = safeFlight.querySelector("[data-sf-serial]");
  const serialStatus = safeFlight.querySelector("[data-sf-serial-status]");

  serialForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const serial = serialInput.value.trim().toUpperCase();
    const valid = /^(TEL|TFEL)-[A-Z0-9-]{4,16}$/.test(serial);
    if (!valid) {
      serialStatus.textContent = "Enter a TEL serial in the format TEL-XXXX. For this preview, try TEL-DEMO-101.";
      serialStatus.classList.remove("success");
      serialInput.focus();
      return;
    }
    state.serial = serial;
    state.accessComplete = true;
    serialInput.value = serial;
    serialInput.disabled = true;
    serialForm.querySelector("button").disabled = true;
    serialStatus.textContent = "Demo kit linked. Your learning pathway is now open.";
    serialStatus.classList.add("success");
    updateProgress();
    showStage("learn");
  });

  safeFlight.querySelectorAll("[data-sf-module-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const module = button.closest("[data-sf-module]");
      const lesson = module.querySelector("[data-sf-lesson]");
      const open = lesson.classList.toggle("open");
      button.setAttribute("aria-expanded", String(open));
      button.textContent = open ? "Close learning card" : "Open learning card";
    });
  });

  safeFlight.querySelectorAll("[data-sf-module-complete]").forEach((button) => {
    button.addEventListener("click", () => {
      const module = button.closest("[data-sf-module]");
      const moduleId = module.dataset.sfModule;
      state.modules.add(moduleId);
      module.classList.add("complete");
      button.disabled = true;
      button.textContent = "Reviewed ✓";
      const status = module.querySelector("[data-module-status]");
      if (status) status.textContent = "Complete";
      updateProgress();
      if (stageComplete[1]()) showStage("conditions");
    });
  });

  safeFlight.querySelectorAll("[data-sf-check]").forEach((button) => {
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
      const checkId = button.dataset.sfCheck;
      const selected = !button.classList.contains("selected");
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
      if (selected) state.conditions.add(checkId);
      else state.conditions.delete(checkId);
      const status = safeFlight.querySelector("[data-sf-condition-status]");
      status.textContent = `${state.conditions.size} of ${safeFlight.querySelectorAll("[data-sf-check]").length} checks confirmed with the supervising adult.`;
      status.classList.toggle("success", stageComplete[2]());
      updateProgress();
      if (stageComplete[2]()) {
        status.textContent = "Checklist complete. The randomized knowledge check is now available.";
        showStage("quiz");
        if (!state.quizQuestions.length) startQuiz();
      }
    });
  });

  const weatherBox = safeFlight.querySelector("[data-weather-state]");
  const weatherStatus = safeFlight.querySelector("[data-weather-status]");
  const weatherLocation = safeFlight.querySelector("[data-weather-location]");
  const weatherMetrics = safeFlight.querySelector("[data-weather-metrics]");
  const weatherCity = safeFlight.querySelector("[data-weather-city]");

  function weatherLabel(code) {
    if (code === 0) return "Clear sky";
    if ([1, 2, 3].includes(code)) return "Cloudy conditions";
    if ([45, 48].includes(code)) return "Fog or low visibility";
    if (code >= 51 && code <= 67) return "Rain or drizzle";
    if (code >= 71 && code <= 77) return "Snow conditions";
    if (code >= 80 && code <= 82) return "Rain showers";
    if (code >= 85 && code <= 86) return "Snow showers";
    if (code >= 95) return "Thunderstorm conditions";
    return "Conditions reported";
  }

  function weatherAssessment(current) {
    const code = Number(current.weather_code ?? 0);
    const gust = Number(current.wind_gusts_10m ?? 0);
    const precipitation = Number(current.precipitation ?? 0);
    const visibility = Number(current.visibility ?? 99999);
    if (code >= 95 || visibility < 5000) {
      return { level: "pause", label: "Pause and ask the supervising adult to reassess" };
    }
    if (precipitation > 0 || code >= 45 || gust >= 20) {
      return { level: "caution", label: "Caution detected — adult review required" };
    }
    return { level: "review", label: "No automatic clearance — adult review still required" };
  }

  async function loadWeather(latitude, longitude, placeName) {
    weatherStatus.textContent = "Checking current conditions…";
    weatherBox.className = "sf-weather-state";
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
      const current = data.current;
      const assessment = weatherAssessment(current);
      weatherBox.classList.add(assessment.level);
      weatherLocation.textContent = placeName || "Current location";
      weatherStatus.textContent = assessment.label;
      weatherMetrics.innerHTML = `
        <div><small>Condition</small><strong>${weatherLabel(Number(current.weather_code))}</strong></div>
        <div><small>Wind</small><strong>${Math.round(Number(current.wind_speed_10m))} km/h</strong></div>
        <div><small>Gusts</small><strong>${Math.round(Number(current.wind_gusts_10m))} km/h</strong></div>
        <div><small>Precipitation</small><strong>${Number(current.precipitation).toFixed(1)} mm</strong></div>
        <div><small>Visibility</small><strong>${Math.round(Number(current.visibility) / 1000)} km</strong></div>
        <div><small>Temperature</small><strong>${Math.round(Number(current.temperature_2m))}°C</strong></div>`;
    } catch (error) {
      weatherStatus.textContent = "Live conditions could not be loaded. Use an approved local weather source and ask the supervising adult.";
      weatherBox.classList.add("caution");
    }
  }

  safeFlight.querySelector("[data-weather-location-button]")?.addEventListener("click", () => {
    if (!("geolocation" in navigator)) {
      weatherStatus.textContent = "Location services are unavailable. Search for the city instead.";
      return;
    }
    weatherStatus.textContent = "Requesting location permission…";
    navigator.geolocation.getCurrentPosition(
      (position) => loadWeather(position.coords.latitude, position.coords.longitude, "Current location"),
      () => { weatherStatus.textContent = "Location was not shared. Search for the city instead."; },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  });

  safeFlight.querySelector("[data-weather-search]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const city = weatherCity.value.trim();
    if (!city) return;
    weatherStatus.textContent = "Finding that location…";
    try {
      const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`);
      if (!response.ok) throw new Error("Location service unavailable");
      const data = await response.json();
      const result = data.results?.[0];
      if (!result) throw new Error("Location not found");
      const label = [result.name, result.admin1, result.country].filter(Boolean).join(", ");
      await loadWeather(result.latitude, result.longitude, label);
    } catch (error) {
      weatherStatus.textContent = "Location not found. Check the spelling or use your current location.";
      weatherBox.classList.add("caution");
    }
  });

  const questionBank = [
    {
      question: "Who makes the final decision about whether a supervised practical session can continue?",
      answers: ["The student holding the kit", "The designated supervising adult", "The person running the countdown"],
      correct: 1,
      explanation: "The designated adult keeps responsibility and practical control throughout the session."
    },
    {
      question: "The weather changes after the checklist is completed. What should happen?",
      answers: ["Continue because the checklist was already completed", "Pause and ask the adult to reassess", "Ignore it if the group is ready"],
      correct: 1,
      explanation: "Readiness is ongoing. A meaningful change is a reason to pause and reassess."
    },
    {
      question: "A spectator crosses the marked boundary. What is the responsible response?",
      answers: ["Pause the activity and alert the supervising adult", "Ask them to move while continuing", "Let the nearest student decide"],
      correct: 0,
      explanation: "The boundary must remain clear. Pause and let the supervising adult restore the agreed setup."
    },
    {
      question: "What does a SafeFlight certificate confirm?",
      answers: ["Automatic permission for any activity", "Completion of this learning checkpoint", "That weather will remain unchanged"],
      correct: 1,
      explanation: "It records learning completion only; it is never launch authorization."
    },
    {
      question: "If an instruction or condition is unclear, what should a learner do?",
      answers: ["Guess based on the previous step", "Skip it without mentioning it", "Stop and ask the supervising adult"],
      correct: 2,
      explanation: "Uncertainty is a reason to stop and ask, not to guess."
    },
    {
      question: "Why is the kit serial checked at the beginning?",
      answers: ["To connect the learner with the correct controlled pathway", "To replace adult supervision", "To publish the lock code"],
      correct: 0,
      explanation: "The serial connects the correct kit and learning pathway; it does not replace supervision."
    },
    {
      question: "What should happen if the approved field becomes unavailable?",
      answers: ["Move to any open-looking area", "Pause until an appropriate location is approved", "Use a smaller group anywhere"],
      correct: 1,
      explanation: "Changing the location changes the safety conditions and requires fresh approval."
    },
    {
      question: "What is the purpose of the weather panel?",
      answers: ["To guarantee safe conditions", "To replace local observations", "To add information for the adult's decision"],
      correct: 2,
      explanation: "Weather data adds context but cannot guarantee conditions or make the final decision."
    },
    {
      question: "When may a student share a kit code with another group?",
      answers: ["Whenever the other group asks", "Only when the responsible teacher manages access", "After posting it in the class chat"],
      correct: 1,
      explanation: "Access is managed by the responsible teacher and should not be publicly shared."
    },
    {
      question: "Which statement best represents SafeFlight?",
      answers: ["Speed matters more than preparation", "Safety and responsible decisions are part of engineering", "A completed quiz removes the need for supervision"],
      correct: 1,
      explanation: "Preparation, limits and responsible decisions are part of the engineering process."
    }
  ];

  const quizQuestion = safeFlight.querySelector("[data-sf-question]");
  const quizOptions = safeFlight.querySelector("[data-sf-options]");
  const quizFeedback = safeFlight.querySelector("[data-sf-quiz-feedback]");
  const quizCounter = safeFlight.querySelector("[data-sf-quiz-counter]");
  const quizScore = safeFlight.querySelector("[data-sf-quiz-score]");
  const quizTrack = safeFlight.querySelector("[data-sf-quiz-track]");
  const quizNext = safeFlight.querySelector("[data-sf-quiz-next]");
  const quizContent = safeFlight.querySelector("[data-sf-quiz-content]");
  const quizResult = safeFlight.querySelector("[data-sf-quiz-result]");

  function shuffledQuestions() {
    return [...questionBank].sort(() => Math.random() - .5).slice(0, 5);
  }

  function startQuiz() {
    state.quizQuestions = shuffledQuestions();
    state.quizIndex = 0;
    state.quizScore = 0;
    state.quizAnswered = false;
    quizContent.hidden = false;
    quizResult.hidden = true;
    renderQuestion();
  }

  function renderQuestion() {
    const item = state.quizQuestions[state.quizIndex];
    quizQuestion.textContent = item.question;
    quizCounter.textContent = `Question ${state.quizIndex + 1} of ${state.quizQuestions.length}`;
    quizScore.textContent = `Score ${state.quizScore}/${state.quizQuestions.length}`;
    quizTrack.style.width = `${(state.quizIndex / state.quizQuestions.length) * 100}%`;
    quizFeedback.textContent = "Select one answer. Every question must be correct to pass.";
    quizNext.hidden = true;
    quizOptions.innerHTML = "";
    item.answers.forEach((answer, index) => {
      const button = document.createElement("button");
      button.className = "sf-option";
      button.type = "button";
      button.innerHTML = `<i>${String.fromCharCode(65 + index)}</i><span>${answer}</span>`;
      button.addEventListener("click", () => answerQuestion(index));
      quizOptions.append(button);
    });
  }

  function answerQuestion(index) {
    if (state.quizAnswered) return;
    state.quizAnswered = true;
    const item = state.quizQuestions[state.quizIndex];
    const options = [...quizOptions.querySelectorAll("button")];
    const correct = index === item.correct;
    if (correct) state.quizScore += 1;
    options.forEach((option, optionIndex) => {
      option.disabled = true;
      if (optionIndex === item.correct) option.classList.add("correct");
      if (optionIndex === index && !correct) option.classList.add("wrong");
    });
    quizFeedback.textContent = `${correct ? "Correct." : "Not quite."} ${item.explanation}`;
    quizScore.textContent = `Score ${state.quizScore}/${state.quizQuestions.length}`;
    quizNext.hidden = false;
    quizNext.textContent = state.quizIndex === state.quizQuestions.length - 1 ? "See result" : "Next question";
  }

  quizNext?.addEventListener("click", () => {
    state.quizIndex += 1;
    state.quizAnswered = false;
    if (state.quizIndex < state.quizQuestions.length) renderQuestion();
    else finishQuiz();
  });

  function finishQuiz() {
    const passed = state.quizScore === state.quizQuestions.length;
    state.quizPassed = passed;
    quizContent.hidden = true;
    quizResult.hidden = false;
    quizTrack.style.width = "100%";
    quizResult.innerHTML = passed
      ? `<div class="sf-result-mark">✓</div><h4>100% — checkpoint complete</h4><p>You demonstrated the required safety understanding. The code below is a non-operational demonstration; production kit codes must come from TEL's secure server.</p><button class="button button-primary" type="button" data-sf-continue>Continue to Mission Control</button>`
      : `<div class="sf-result-mark" style="color:var(--sf-warning)">↻</div><h4>${state.quizScore}/5 — review and retry</h4><p>SafeFlight requires every answer to be correct. Review the feedback, then try a newly randomized set.</p><button class="button button-ghost" type="button" data-sf-retry>Try another set</button>`;
    quizResult.querySelector("[data-sf-retry]")?.addEventListener("click", startQuiz);
    quizResult.querySelector("[data-sf-continue]")?.addEventListener("click", () => showStage("mission"));
    if (passed) {
      safeFlight.querySelectorAll("[data-sf-code-digit]").forEach((digit) => { digit.textContent = "0"; });
      updateProgress();
      showStage("mission");
    }
  }

  const missionDisplay = safeFlight.querySelector("[data-sf-mission-display]");
  const missionStart = safeFlight.querySelector("[data-sf-mission-start]");
  const missionStop = safeFlight.querySelector("[data-sf-mission-stop]");
  const certificateButton = safeFlight.querySelector("[data-sf-certificate]");

  function playCue(final = false) {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = final ? 720 : 440;
      gain.gain.setValueAtTime(.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(.12, context.currentTime + .015);
      gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + .12);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + .14);
      oscillator.addEventListener("ended", () => context.close());
    } catch (error) {
      /* Audio cues are optional; visual status remains available. */
    }
  }

  function stopCountdown(message = "Simulation paused") {
    window.clearInterval(state.countdownTimer);
    state.countdownTimer = null;
    missionDisplay.innerHTML = `<div><strong>—</strong><span>${message}</span></div>`;
    missionStart.disabled = false;
  }

  missionStart?.addEventListener("click", () => {
    if (!state.quizPassed || state.countdownTimer) return;
    let value = 5;
    missionStart.disabled = true;
    missionDisplay.innerHTML = `<div><strong>${value}</strong><span>Classroom readiness simulation</span></div>`;
    playCue();
    state.countdownTimer = window.setInterval(() => {
      value -= 1;
      if (value > 0) {
        missionDisplay.innerHTML = `<div><strong>${value}</strong><span>Classroom readiness simulation</span></div>`;
        playCue();
        return;
      }
      window.clearInterval(state.countdownTimer);
      state.countdownTimer = null;
      state.missionComplete = true;
      missionDisplay.innerHTML = "<div><strong>CHECK</strong><span>Simulation complete — await adult direction</span></div>";
      missionStart.disabled = false;
      certificateButton.disabled = false;
      playCue(true);
      updateProgress();
    }, 1000);
  });

  missionStop?.addEventListener("click", () => stopCountdown());

  function pdfEscape(value) {
    return String(value).replace(/[^\x20-\x7E]/g, "").replace(/([\\()])/g, "\\$1");
  }

  function createCertificatePdf(studentName, serial) {
    const date = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
    const content = [
      "q 0.07 0.06 0.11 rg 0 0 595 842 re f Q",
      "q 0.80 0.74 1.00 RG 3 w 42 42 511 758 re S Q",
      "BT /F1 12 Tf 0.80 0.74 1.00 rg 72 746 Td (TECH FOR EASY LIFE) Tj ET",
      "BT /F1 32 Tf 1 1 1 rg 72 680 Td (SAFEFLIGHT) Tj ET",
      "BT /F1 18 Tf 1 1 1 rg 72 646 Td (Flight Readiness Learning Certificate) Tj ET",
      `BT /F1 13 Tf 0.72 0.72 0.78 rg 72 580 Td (Presented to) Tj ET`,
      `BT /F1 25 Tf 1 1 1 rg 72 538 Td (${pdfEscape(studentName)}) Tj ET`,
      `BT /F1 12 Tf 0.72 0.72 0.78 rg 72 492 Td (Completed the TEL SafeFlight digital learning checkpoint.) Tj ET`,
      `BT /F1 11 Tf 0.80 0.74 1.00 rg 72 438 Td (Kit reference: ${pdfEscape(serial || "TEL-DEMO")}) Tj ET`,
      `BT /F1 11 Tf 0.80 0.74 1.00 rg 72 416 Td (Date: ${pdfEscape(date)}) Tj ET`,
      "BT /F1 9 Tf 0.60 0.60 0.66 rg 72 118 Td (Learning record only. This certificate is not launch authorization.) Tj ET",
      "BT /F1 9 Tf 0.60 0.60 0.66 rg 72 98 Td (Adult supervision, institution approval and current conditions remain required.) Tj ET"
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
    const xrefOffset = new TextEncoder().encode(pdf).length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return new Blob([pdf], { type: "application/pdf" });
  }

  certificateButton?.addEventListener("click", () => {
    const nameInput = safeFlight.querySelector("[data-sf-student-name]");
    const status = safeFlight.querySelector("[data-sf-certificate-status]");
    const name = nameInput.value.trim();
    if (!state.missionComplete) {
      status.textContent = "Complete the classroom countdown simulation first.";
      status.className = "sf-inline-status warning";
      return;
    }
    if (name.length < 2) {
      status.textContent = "Enter the learner's name for the certificate.";
      status.className = "sf-inline-status warning";
      nameInput.focus();
      return;
    }
    const blob = createCertificatePdf(name, state.serial);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `TEL-SafeFlight-${name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}.pdf`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = "Certificate downloaded. Keep it as a learning record.";
    status.className = "sf-inline-status success";
  });

  const calculatorForm = document.querySelector("[data-altitude-form]");
  calculatorForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const distance = Number(calculatorForm.elements.distance.value);
    const angle = Number(calculatorForm.elements.angle.value);
    const result = document.querySelector("[data-altitude-result]");
    if (!(distance > 0) || !(angle > 0 && angle < 89)) {
      result.innerHTML = "<strong>Check the values</strong><small>Use a positive distance and an angle between 1° and 88°.</small>";
      return;
    }
    const height = distance * Math.tan(angle * Math.PI / 180);
    result.innerHTML = `<strong>${height.toFixed(1)} m</strong><small>${distance.toFixed(1)} × tan(${angle.toFixed(1)}°) — classroom estimate only</small>`;
  });

  document.querySelector("[data-teacher-preview]")?.addEventListener("click", () => {
    document.querySelector("[data-teacher-controls]")?.classList.toggle("sf-hidden");
  });

  document.querySelector("[data-sf-reset]")?.addEventListener("click", () => {
    if (window.confirm("Reset this browser's SafeFlight demonstration?")) window.location.reload();
  });

  stages.forEach((stage, index) => { stage.hidden = index !== 0; });
  updateProgress();
}
