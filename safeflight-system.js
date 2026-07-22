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

  const safetyRules = [
    {
      scenario: "the designated adult has not confirmed that the supervised session may continue",
      correct: "Wait and ask the designated adult for a decision",
      distractors: ["Begin because the digital checks look complete", "Let the learner group vote on whether to continue"],
      explanation: "The designated adult keeps responsibility and makes the decision."
    },
    {
      scenario: "the weather changes after the conditions were reviewed",
      correct: "Pause and ask the designated adult to reassess",
      distractors: ["Rely on the earlier weather check", "Continue until the current digital step is finished"],
      explanation: "Readiness must be reassessed whenever meaningful conditions change."
    },
    {
      scenario: "a person enters the marked spectator boundary",
      correct: "Pause and alert the designated adult",
      distractors: ["Continue while asking the person to move", "Let the nearest learner manage the boundary"],
      explanation: "The group pauses so the supervising adult can restore the approved boundary."
    },
    {
      scenario: "a learner does not understand an instruction",
      correct: "Stop and ask the supervising adult for clarification",
      distractors: ["Guess from the previous instruction", "Copy another group without asking"],
      explanation: "Uncertainty is a reason to stop and ask rather than guess."
    },
    {
      scenario: "the kit serial does not match the learner’s assigned record",
      correct: "Leave the kit as it is and tell the responsible teacher",
      distractors: ["Edit the serial shown on the screen", "Use the kit because it looks similar"],
      explanation: "A mismatch must be resolved by the responsible teacher before the pathway continues."
    },
    {
      scenario: "the institution’s approved learning area is unavailable",
      correct: "Wait until the institution approves an appropriate alternative",
      distractors: ["Choose any area that appears open", "Create a smaller boundary without approval"],
      explanation: "A different location needs fresh institutional review and approval."
    },
    {
      scenario: "the weather panel shows green with no automatic caution",
      correct: "Still use local observations and wait for the mentor’s decision",
      distractors: ["Treat green as automatic permission", "Ignore official local alerts because the website is green"],
      explanation: "Green is supporting information, not permission or a guarantee."
    },
    {
      scenario: "the weather panel shows a yellow caution",
      correct: "Pause and ask the mentor to reassess current conditions",
      distractors: ["Treat yellow the same as green", "Allow a learner to dismiss the warning"],
      explanation: "Yellow means the conditions need mentor review before the demonstration can continue."
    },
    {
      scenario: "the weather panel shows a red warning",
      correct: "Do not proceed and follow the mentor and official local alerts",
      distractors: ["Wait briefly and continue without another review", "Continue because the checklist was completed earlier"],
      explanation: "Red blocks the demonstration and requires the group to follow adult direction and local alerts."
    },
    {
      scenario: "a learner is asked by another student to handle restricted equipment",
      correct: "Do not handle it and alert the responsible mentor",
      distractors: ["Follow the request because it came from a classmate", "Handle it quickly before the next check"],
      explanation: "Restricted equipment remains under the responsible adult’s control."
    },
    {
      scenario: "the agreed stop signal is given",
      correct: "Stop immediately and wait for adult direction",
      distractors: ["Finish the current action before stopping", "Ask the learner group to vote on stopping"],
      explanation: "The stop signal is immediate and is followed by adult direction."
    },
    {
      scenario: "a spectator asks to cross the agreed boundary",
      correct: "Keep the boundary in place and refer the request to the adult",
      distractors: ["Allow a quick crossing without pausing", "Move the boundary to make room"],
      explanation: "Only the responsible adult manages changes to the approved people and boundary plan."
    },
    {
      scenario: "the assigned learning kit appears damaged or incomplete",
      correct: "Do not use it and tell the supervising adult",
      distractors: ["Improvise a repair with available materials", "Ignore the issue if the lesson is nearly finished"],
      explanation: "A damaged or incomplete kit is set aside for adult review rather than improvised use."
    },
    {
      scenario: "the supervising adult steps away from the group",
      correct: "Pause until the responsible adult returns or formally transfers supervision",
      distractors: ["Continue quietly while the adult is away", "Appoint a learner as the temporary supervisor"],
      explanation: "The supervised pathway does not continue without the responsible adult."
    },
    {
      scenario: "the group feels rushed and has not finished the checklist",
      correct: "Slow down and complete every check with the adult",
      distractors: ["Skip items that were correct last time", "Guess the remaining answers to save time"],
      explanation: "Time pressure never replaces a complete supervised review."
    },
    {
      scenario: "an official local alert conflicts with the website’s weather display",
      correct: "Pause and follow the official alert and the mentor’s direction",
      distractors: ["Trust the website instead of the official alert", "Let the learners choose which source they prefer"],
      explanation: "Official local alerts and adult direction take priority over this demonstration."
    },
    {
      scenario: "a learner has downloaded a SafeFlight certificate",
      correct: "Treat it only as a record of learning completion",
      distractors: ["Treat it as permission for a practical activity", "Use it to bypass the mentor checklist"],
      explanation: "The certificate records learning only and does not grant practical authorization."
    },
    {
      scenario: "the public demonstration reveals code 000",
      correct: "Recognize it as non-operational and never use it for a physical kit",
      distractors: ["Try it on any available physical kit", "Post it publicly as a working access code"],
      explanation: "Code 000 is deliberately non-operational and exists only to demonstrate the interface."
    },
    {
      scenario: "another learner asks to bypass the quiz or copy answers",
      correct: "Ask them to complete their own learning and supervised check",
      distractors: ["Share the answers so the class finishes faster", "Use the teacher-panel preview to skip the quiz"],
      explanation: "Each learner completes the safety understanding rather than bypassing it."
    },
    {
      scenario: "a condition changes after its checklist item was selected",
      correct: "Reopen the affected check and reassess it with the adult",
      distractors: ["Keep the earlier selection because it was once correct", "Avoid mentioning the change until the quiz is finished"],
      explanation: "Checklist status must reflect current conditions, not an earlier moment."
    }
  ];

  const scenarioContexts = [
    "Before the supervised session begins,",
    "During the classroom readiness review,",
    "After the group has paused,",
    "When a second learner group arrives,",
    "While the approved area is being checked,",
    "During a teacher-led demonstration,",
    "When local conditions are being reassessed,",
    "Before entering TEL Control,",
    "After the class changes its schedule,",
    "As the team prepares to complete the checklist,"
  ];

  const questionPrompts = [
    "What is the best response?",
    "Which action follows SafeFlight?",
    "What should the learner do next?",
    "Which choice keeps responsibility clear?",
    "How should the group respond?"
  ];

  function buildQuestionBank() {
    const bank = [];
    safetyRules.forEach((rule, ruleIndex) => {
      scenarioContexts.forEach((context, contextIndex) => {
        questionPrompts.forEach((prompt, promptIndex) => {
          const correct = (ruleIndex + contextIndex + promptIndex) % 3;
          const answers = [...rule.distractors];
          answers.splice(correct, 0, rule.correct);
          bank.push({
            id: `SF-${String(ruleIndex + 1).padStart(2, "0")}-${String(contextIndex + 1).padStart(2, "0")}-${String(promptIndex + 1).padStart(2, "0")}`,
            question: `${context} ${rule.scenario}. ${prompt}`,
            answers,
            correct,
            explanation: rule.explanation
          });
        });
      });
    });
    return bank;
  }

  const questionBank = buildQuestionBank();
  if (questionBank.length !== 1000) throw new Error("SafeFlight question bank must contain exactly 1,000 questions.");
  safeFlight.dataset.questionBankSize = String(questionBank.length);
  const questionBankLabel = safeFlight.querySelector("[data-sf-question-bank]");
  if (questionBankLabel) questionBankLabel.textContent = questionBank.length.toLocaleString("en-IN");

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
    const pool = [...questionBank];
    for (let index = pool.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
    }
    return pool.slice(0, 5);
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
      ? `<div class="sf-result-mark">✓</div><h4>100% — checkpoint complete</h4><p>You demonstrated the required safety understanding. Your separate full-screen TEL Control demonstration is now available below.</p><button class="button button-primary" type="button" data-sf-continue>Reveal TEL Control access</button>`
      : `<div class="sf-result-mark" style="color:var(--sf-warning)">↻</div><h4>${state.quizScore}/5 — review and retry</h4><p>SafeFlight requires every answer to be correct. Review the feedback, then try a newly randomized set.</p><button class="button button-ghost" type="button" data-sf-retry>Try another set</button>`;
    quizResult.querySelector("[data-sf-retry]")?.addEventListener("click", startQuiz);
    quizResult.querySelector("[data-sf-continue]")?.addEventListener("click", () => showStage("mission"));
    if (passed) {
      state.missionComplete = true;
      try { window.sessionStorage.setItem("telSafeFlightDemoPassed", "1"); } catch (error) { /* The visible demo link remains available. */ }
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
