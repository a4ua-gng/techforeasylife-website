"use strict";

document.documentElement.classList.add("js");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const header = document.querySelector("[data-header]");
const nav = document.querySelector("[data-nav]");
const navToggle = document.querySelector("[data-nav-toggle]");

function updateHeader() {
  header?.classList.toggle("scrolled", window.scrollY > 24);
}

updateHeader();
window.addEventListener("scroll", updateHeader, { passive: true });

if (navToggle && nav) {
  navToggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", String(open));
    document.body.style.overflow = open ? "hidden" : "";
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("open");
      navToggle.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
    });
  });
}

const page = document.body.dataset.page;
const pageFiles = {
  home: "index.html",
  product: "product.html",
  schools: "schools.html",
  safety: "safety.html",
  careers: "careers.html",
  about: "about.html",
  contact: "contact.html"
};

document.querySelectorAll(".site-nav a").forEach((link) => {
  const destination = link.getAttribute("href")?.split("?")[0].split("#")[0];
  if (destination === pageFiles[page]) {
    link.classList.add("active");
    link.setAttribute("aria-current", "page");
  }
});

document.querySelectorAll("[data-year]").forEach((element) => {
  element.textContent = new Date().getFullYear();
});

const reveals = document.querySelectorAll(".reveal");
if (reduceMotion || !("IntersectionObserver" in window)) {
  reveals.forEach((item) => item.classList.add("visible"));
} else {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -35px" });
  reveals.forEach((item) => revealObserver.observe(item));
}

if (!reduceMotion && window.matchMedia("(pointer: fine)").matches) {
  document.querySelectorAll("[data-tilt]").forEach((element) => {
    element.addEventListener("pointermove", (event) => {
      const rect = element.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      const depth = Number(element.dataset.depth || 7);
      element.style.transform = `perspective(1000px) rotateX(${-y * depth}deg) rotateY(${x * depth}deg)`;
    });
    element.addEventListener("pointerleave", () => {
      element.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg)";
    });
  });
}

const lightbox = document.querySelector("[data-lightbox]");
const lightboxImage = document.querySelector("[data-lightbox-image]");

function closeLightbox() {
  lightbox?.classList.remove("open");
  document.body.style.overflow = "";
}

document.querySelectorAll("[data-gallery]").forEach((button) => {
  button.addEventListener("click", () => {
    if (!lightbox || !lightboxImage) return;
    lightboxImage.src = button.dataset.gallery;
    const thumbnail = button.querySelector("img");
    lightboxImage.alt = thumbnail?.alt || "Expanded TEL product image";
    lightbox.classList.add("open");
    document.body.style.overflow = "hidden";
    lightbox.querySelector("button")?.focus();
  });
});

document.querySelector("[data-lightbox-close]")?.addEventListener("click", closeLightbox);
lightbox?.addEventListener("click", (event) => {
  if (event.target === lightbox) closeLightbox();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeLightbox();
});

const readinessDemo = document.querySelector("[data-readiness-demo]");
if (readinessDemo) {
  const toggles = [...readinessDemo.querySelectorAll("[data-readiness-toggle]")];
  const count = readinessDemo.querySelector("[data-readiness-count]");
  const state = readinessDemo.querySelector("[data-readiness-state]");
  const orb = readinessDemo.querySelector("[data-readiness-orb]");
  const message = readinessDemo.querySelector("[data-readiness-message]");

  const updateReadiness = () => {
    const selected = toggles.filter((toggle) => toggle.classList.contains("selected")).length;
    count.textContent = `${selected}/${toggles.length}`;
    const ready = selected === toggles.length;
    state.textContent = ready ? "Learning check complete" : "Not ready";
    orb.classList.toggle("ready", ready);
    message.textContent = ready
      ? "Good decision set. In a real programme, the designated adult still decides whether participation can proceed."
      : "Select every condition to complete this decision check.";
  };

  toggles.forEach((toggle) => {
    toggle.addEventListener("click", () => {
      toggle.classList.toggle("selected");
      toggle.setAttribute("aria-pressed", String(toggle.classList.contains("selected")));
      updateReadiness();
    });
    toggle.setAttribute("aria-pressed", "false");
  });
}

const quiz = document.querySelector("[data-quiz]");
if (quiz) {
  const questions = [...quiz.querySelectorAll("[data-question]")];
  const progress = quiz.querySelector("[data-quiz-progress]");
  const counter = quiz.querySelector("[data-quiz-counter]");
  const result = quiz.querySelector("[data-quiz-result]");
  const resultMark = quiz.querySelector("[data-result-mark]");
  const resultTitle = quiz.querySelector("[data-result-title]");
  const resultCopy = quiz.querySelector("[data-result-copy]");
  let current = 0;
  let score = 0;
  let answered = false;

  const updateQuizStatus = () => {
    counter.textContent = `Question ${Math.min(current + 1, questions.length)} of ${questions.length}`;
    progress.style.width = `${((current + 1) / questions.length) * 100}%`;
  };

  const showResult = () => {
    questions.forEach((question) => question.classList.remove("active"));
    const passed = score >= 4;
    result.classList.add("active");
    counter.textContent = `Score: ${score} of ${questions.length}`;
    progress.style.width = "100%";
    resultMark.textContent = passed ? "✓" : "↻";
    resultMark.style.color = passed ? "var(--success)" : "var(--warning)";
    resultTitle.textContent = passed ? "Training checkpoint complete" : "Review and try again";
    resultCopy.textContent = passed
      ? "You passed the public learning demo. A real kit-specific checkpoint, if introduced, would be issued only through TEL’s controlled institution flow—not on this public page."
      : `You scored ${score} out of ${questions.length}. Review the explanations and retake the check—responsible learning is about understanding, not rushing.`;
  };

  questions.forEach((question, questionIndex) => {
    const feedback = question.querySelector("[data-feedback]");
    question.querySelectorAll("[data-answer]").forEach((option) => {
      option.addEventListener("click", () => {
        if (answered || questionIndex !== current) return;
        answered = true;
        const chosen = Number(option.dataset.answer);
        const correct = Number(question.dataset.correct);
        const isCorrect = chosen === correct;
        if (isCorrect) score += 1;
        option.classList.add(isCorrect ? "correct" : "wrong");
        question.querySelector(`[data-answer="${correct}"]`)?.classList.add("correct");
        feedback.textContent = `${isCorrect ? "Correct." : "Not quite."} ${question.dataset.explanation}`;
        question.querySelectorAll("[data-answer]").forEach((answer) => { answer.disabled = true; });

        window.setTimeout(() => {
          question.classList.remove("active");
          current += 1;
          answered = false;
          if (current < questions.length) {
            questions[current].classList.add("active");
            updateQuizStatus();
          } else {
            showResult();
          }
        }, reduceMotion ? 50 : 1350);
      });
    });
  });

  quiz.querySelector("[data-quiz-restart]")?.addEventListener("click", () => {
    current = 0;
    score = 0;
    answered = false;
    result.classList.remove("active");
    questions.forEach((question, index) => {
      question.classList.toggle("active", index === 0);
      question.querySelector("[data-feedback]").textContent = "";
      question.querySelectorAll("[data-answer]").forEach((answer) => {
        answer.disabled = false;
        answer.classList.remove("correct", "wrong");
      });
    });
    updateQuizStatus();
    quiz.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
  });

  updateQuizStatus();
}

const contactForm = document.querySelector("[data-contact-form]");
if (contactForm) {
  const params = new URLSearchParams(window.location.search);
  const topicParam = params.get("topic");
  const topicField = contactForm.querySelector("[name='topic']");
  if (topicParam === "institution") topicField.value = "Institution enquiry";

  contactForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!contactForm.reportValidity()) return;
    const data = new FormData(contactForm);
    const topic = data.get("topic");
    const subject = encodeURIComponent(`${topic} — ${data.get("name")}`);
    const body = encodeURIComponent(
      `Name: ${data.get("name")}\nEmail: ${data.get("email")}\nInstitution / organisation: ${data.get("organisation") || "Not provided"}\n\nMessage:\n${data.get("message")}`
    );
    window.location.href = `mailto:techforeasylife.sales@gmail.com?subject=${subject}&body=${body}`;
  });
}
