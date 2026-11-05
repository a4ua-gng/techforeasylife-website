"use strict";

const switcher = document.querySelector("#leave-paths");
const choices = [...switcher.querySelectorAll("[data-path]")];

function showPath(path) {
  for (const choice of choices) {
    const active = choice.dataset.path === path;
    choice.setAttribute("aria-pressed", String(active));
    document.getElementById(choice.getAttribute("aria-controls")).hidden = !active;
  }
}

showPath("member");
switcher.hidden = false;
for (const choice of choices) {
  choice.addEventListener("click", () => showPath(choice.dataset.path));
}

const status = document.querySelector("#copy-status");

for (const button of document.querySelectorAll("[data-copy]")) {
  const template = document.getElementById(button.dataset.copy);
  const label = button.textContent;
  let reset;
  button.hidden = false;
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(template.textContent.trim());
      button.textContent = "Copied";
      status.textContent = "Template copied to your clipboard.";
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(template);
      selection.removeAllRanges();
      selection.addRange(range);
      button.textContent = "Text selected";
      status.textContent = "Template selected. Use your device’s copy command.";
    }
    clearTimeout(reset);
    reset = setTimeout(() => { button.textContent = label; }, 2300);
  });
}
