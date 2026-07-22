"use strict";

const assemblyGame = document.querySelector("[data-assembly-game]");

if (assemblyGame) {
  const partButtons = [...assemblyGame.querySelectorAll("[data-part-button]")];
  const score = assemblyGame.querySelector("[data-assembly-score]");
  const status = assemblyGame.querySelector("[data-assembly-status]");
  const stage = assemblyGame.querySelector("[data-assembly-stage]");

  function updateAssembly() {
    const selected = partButtons.filter((button) => button.classList.contains("selected"));
    stage.dataset.progress = String(selected.length);
    score.textContent = `${selected.length}/4 fitted`;
    if (selected.length === 4) {
      status.textContent = "All visual layers complete—the real TEL prototype is fully revealed.";
      status.style.color = "var(--success)";
    } else {
      status.textContent = `Choose ${4 - selected.length} more visual ${4 - selected.length === 1 ? "piece" : "pieces"} for the digital model.`;
      status.style.color = "";
    }
  }

  partButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const part = button.dataset.partButton;
      const selected = button.classList.toggle("selected");
      button.setAttribute("aria-pressed", String(selected));
      updateAssembly();
    });
    button.setAttribute("aria-pressed", "false");
  });

  assemblyGame.querySelector("[data-assembly-reset]")?.addEventListener("click", () => {
    partButtons.forEach((button) => {
      button.classList.remove("selected");
      button.setAttribute("aria-pressed", "false");
    });
    updateAssembly();
  });

  updateAssembly();
}

const flightGame = document.querySelector("[data-flight-game]");

if (flightGame) {
  const canvas = flightGame.querySelector("canvas");
  const context = canvas.getContext("2d");
  const overlay = flightGame.querySelector("[data-flight-overlay]");
  const startButton = flightGame.querySelector("[data-flight-start]");
  const scoreText = flightGame.querySelector("[data-flight-score]");
  const timeText = flightGame.querySelector("[data-flight-time]");
  const bestText = flightGame.querySelector("[data-flight-best]");
  const statusText = flightGame.querySelector("[data-flight-status]");
  const leftButton = flightGame.querySelector("[data-flight-left]");
  const rightButton = flightGame.querySelector("[data-flight-right]");

  const width = canvas.width;
  const height = canvas.height;
  const rocketSprite = new Image();
  rocketSprite.src = "tel-rocket-real.webp";
  const input = { left: false, right: false };
  let storedBest = 0;
  try { storedBest = Number(window.localStorage.getItem("telSkywayBest") || 0); } catch (error) { storedBest = 0; }

  const game = {
    running: false,
    score: 0,
    best: storedBest,
    remaining: 20,
    playerX: width / 2,
    objects: [],
    stars: Array.from({ length: 54 }, () => ({ x: Math.random() * width, y: Math.random() * height, size: Math.random() * 1.8 + .3 })),
    spawnClock: 0,
    previousTime: 0,
    animationId: 0
  };

  bestText.textContent = String(game.best);

  function roundedRect(ctx, x, y, w, h, radius) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
  }

  function drawBackground(delta) {
    const gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#090719");
    gradient.addColorStop(.62, "#17142d");
    gradient.addColorStop(1, "#29203c");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    context.fillStyle = "rgba(203,188,255,.85)";
    game.stars.forEach((star) => {
      if (game.running) star.y += 22 * delta;
      if (star.y > height) { star.y = 0; star.x = Math.random() * width; }
      context.globalAlpha = .35 + star.size / 3;
      context.beginPath();
      context.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      context.fill();
    });
    context.globalAlpha = 1;

    context.fillStyle = "#151326";
    context.beginPath();
    context.moveTo(0, height);
    context.lineTo(0, height - 78);
    context.lineTo(105, height - 160);
    context.lineTo(185, height - 92);
    context.lineTo(310, height - 205);
    context.lineTo(430, height - 104);
    context.lineTo(570, height - 178);
    context.lineTo(690, height - 75);
    context.lineTo(800, height - 150);
    context.lineTo(width, height - 95);
    context.lineTo(width, height);
    context.closePath();
    context.fill();

    context.fillStyle = "#0d0c17";
    context.beginPath();
    context.moveTo(0, height);
    context.lineTo(0, height - 40);
    context.lineTo(130, height - 118);
    context.lineTo(265, height - 52);
    context.lineTo(410, height - 126);
    context.lineTo(548, height - 45);
    context.lineTo(715, height - 126);
    context.lineTo(width, height - 45);
    context.lineTo(width, height);
    context.closePath();
    context.fill();
  }

  function drawRocket() {
    const x = game.playerX;
    const y = height - 115;
    context.save();
    const trail = context.createLinearGradient(0, 27, 0, 69);
    trail.addColorStop(0, "rgba(203,188,255,.9)");
    trail.addColorStop(1, "rgba(159,196,255,0)");
    context.fillStyle = trail;
    context.beginPath();
    context.moveTo(x - 8, y + 34);
    context.lineTo(x, y + 78);
    context.lineTo(x + 8, y + 34);
    context.closePath();
    context.fill();
    if (rocketSprite.complete && rocketSprite.naturalWidth) {
      context.drawImage(rocketSprite, x - 28, y - 54, 56, 86);
    }
    context.restore();
  }

  function drawBeacon(object) {
    context.save();
    context.translate(object.x, object.y);
    context.strokeStyle = "rgba(203,188,255,.85)";
    context.lineWidth = 3;
    context.beginPath();
    context.arc(0, 0, object.radius, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = "#d9ceff";
    context.beginPath();
    context.arc(0, 0, 4, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawCloud(object) {
    context.save();
    context.translate(object.x, object.y);
    context.fillStyle = "rgba(119,126,157,.88)";
    context.beginPath();
    context.arc(-18, 5, 18, Math.PI, 0);
    context.arc(2, -3, 25, Math.PI, 0);
    context.arc(26, 6, 16, Math.PI, 0);
    context.lineTo(38, 16);
    context.lineTo(-36, 16);
    context.closePath();
    context.fill();
    context.restore();
  }

  function spawnObject() {
    const beacon = Math.random() > .34;
    game.objects.push({
      type: beacon ? "beacon" : "cloud",
      x: 55 + Math.random() * (width - 110),
      y: -45,
      radius: beacon ? 17 : 28,
      speed: 185 + Math.random() * 90
    });
  }

  function updateObjects(delta) {
    game.spawnClock += delta;
    if (game.spawnClock >= .68) {
      game.spawnClock = 0;
      spawnObject();
    }
    const playerY = height - 115;
    game.objects.forEach((object) => {
      object.y += object.speed * delta;
      const dx = object.x - game.playerX;
      const dy = object.y - playerY;
      if (!object.hit && Math.hypot(dx, dy) < object.radius + 22) {
        object.hit = true;
        if (object.type === "beacon") {
          game.score += 1;
          statusText.textContent = "Beacon collected";
        } else {
          game.score = Math.max(0, game.score - 1);
          statusText.textContent = "Cloud detour: minus one";
        }
        scoreText.textContent = String(game.score);
      }
    });
    game.objects = game.objects.filter((object) => object.y < height + 60 && !object.hit);
  }

  function endGame() {
    game.running = false;
    if (game.score > game.best) {
      game.best = game.score;
      try { window.localStorage.setItem("telSkywayBest", String(game.best)); } catch (error) { /* Local score saving is optional. */ }
      bestText.textContent = String(game.best);
    }
    overlay.classList.remove("hidden");
    overlay.innerHTML = `<div><h4>Mission complete</h4><p>You collected <strong>${game.score}</strong> signal ${game.score === 1 ? "beacon" : "beacons"}. This is a fictional arcade challenge—not a flight simulator.</p><button class="button button-primary" type="button" data-flight-restart>Play again</button></div>`;
    overlay.querySelector("[data-flight-restart]").addEventListener("click", startGame);
    statusText.textContent = "Run complete";
  }

  function frame(time) {
    const delta = Math.min((time - game.previousTime) / 1000 || 0, .04);
    game.previousTime = time;
    drawBackground(delta);
    if (game.running) {
      const direction = Number(input.right) - Number(input.left);
      game.playerX += direction * 285 * delta;
      game.playerX = Math.max(42, Math.min(width - 42, game.playerX));
      game.remaining -= delta;
      timeText.textContent = `${Math.max(0, Math.ceil(game.remaining))}s`;
      updateObjects(delta);
      if (game.remaining <= 0) endGame();
    }
    game.objects.forEach((object) => object.type === "beacon" ? drawBeacon(object) : drawCloud(object));
    drawRocket();
    game.animationId = window.requestAnimationFrame(frame);
  }

  function startGame() {
    game.running = true;
    game.score = 0;
    game.remaining = 20;
    game.playerX = width / 2;
    game.objects = [];
    game.spawnClock = 0;
    game.previousTime = performance.now();
    scoreText.textContent = "0";
    timeText.textContent = "20s";
    statusText.textContent = "Collect signal beacons";
    overlay.classList.add("hidden");
  }

  function bindHold(button, direction) {
    const on = (event) => { event.preventDefault(); input[direction] = true; };
    const off = () => { input[direction] = false; };
    button.addEventListener("pointerdown", on);
    button.addEventListener("pointerup", off);
    button.addEventListener("pointercancel", off);
    button.addEventListener("pointerleave", off);
  }

  bindHold(leftButton, "left");
  bindHold(rightButton, "right");
  startButton?.addEventListener("click", startGame);
  window.addEventListener("keydown", (event) => {
    if (!game.running || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    input[event.key === "ArrowLeft" ? "left" : "right"] = true;
  });
  window.addEventListener("keyup", (event) => {
    if (event.key === "ArrowLeft") input.left = false;
    if (event.key === "ArrowRight") input.right = false;
  });

  game.animationId = window.requestAnimationFrame(frame);
}

const memoryGame = document.querySelector("[data-memory-game]");

if (memoryGame) {
  const photos = [
    { id: "kit", src: "kit-box.webp", label: "TEL Kit" },
    { id: "open-one", src: "kit-open-01.webp", label: "Inside the kit" },
    { id: "open-two", src: "kit-open-02.webp", label: "Kit details" },
    { id: "prototype", src: "tel-rocket-real.webp", label: "TEL prototype" },
    { id: "school", src: "tel-school-box.webp", label: "School experience" },
    { id: "workshop", src: "engineering-workshop.webp", label: "Workshop learning" }
  ];
  const board = memoryGame.querySelector("[data-memory-board]");
  const movesText = memoryGame.querySelector("[data-memory-moves]");
  const pairsText = memoryGame.querySelector("[data-memory-pairs]");
  const statusText = memoryGame.querySelector("[data-memory-status]");
  const message = memoryGame.querySelector("[data-memory-message]");
  let first = null;
  let second = null;
  let locked = false;
  let moves = 0;
  let pairs = 0;

  function shuffle(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  function updateMemoryStatus() {
    movesText.textContent = String(moves);
    pairsText.textContent = `${pairs}/${photos.length}`;
    statusText.textContent = pairs === photos.length ? "All pairs matched" : `${photos.length - pairs} ${photos.length - pairs === 1 ? "pair" : "pairs"} remaining`;
  }

  function chooseCard(button) {
    if (locked || button === first || button.classList.contains("matched")) return;
    button.classList.add("flipped");
    button.setAttribute("aria-label", `${button.dataset.label} card revealed`);
    if (!first) {
      first = button;
      message.textContent = "Choose one more card.";
      return;
    }
    second = button;
    moves += 1;
    locked = true;
    const match = first.dataset.cardId === second.dataset.cardId;
    if (match) {
      window.setTimeout(() => {
        first.classList.add("matched");
        second.classList.add("matched");
        pairs += 1;
        message.textContent = pairs === photos.length ? `Mission deck complete in ${moves} moves.` : "Pair found—keep going.";
        first = null;
        second = null;
        locked = false;
        updateMemoryStatus();
      }, 380);
    } else {
      window.setTimeout(() => {
        first.classList.remove("flipped");
        second.classList.remove("flipped");
        first.setAttribute("aria-label", "Hidden TEL mission card");
        second.setAttribute("aria-label", "Hidden TEL mission card");
        first = null;
        second = null;
        locked = false;
        message.textContent = "Not a pair—try a different combination.";
        updateMemoryStatus();
      }, 780);
    }
    updateMemoryStatus();
  }

  function buildDeck() {
    first = null;
    second = null;
    locked = false;
    moves = 0;
    pairs = 0;
    board.innerHTML = "";
    const deck = shuffle([...photos, ...photos].map((photo, index) => ({ ...photo, instance: index })));
    deck.forEach((photo) => {
      const button = document.createElement("button");
      button.className = "memory-card";
      button.type = "button";
      button.dataset.cardId = photo.id;
      button.dataset.label = photo.label;
      button.setAttribute("aria-label", "Hidden TEL mission card");
      button.innerHTML = `<span class="memory-card-inner"><span class="memory-face memory-front"><img src="tel-logo.webp" alt=""></span><span class="memory-face memory-back"><img src="${photo.src}" alt=""><span>${photo.label}</span></span></span>`;
      button.addEventListener("click", () => chooseCard(button));
      board.append(button);
    });
    message.textContent = "Select two cards to find a matching pair.";
    updateMemoryStatus();
  }

  memoryGame.querySelector("[data-memory-reset]")?.addEventListener("click", buildDeck);
  buildDeck();
}
