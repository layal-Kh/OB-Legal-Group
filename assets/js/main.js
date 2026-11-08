/* OB Legal Group — page behaviour: navigation, contact form, reveal-on-scroll */
const $ = (s, r = document) => r.querySelector(s);

/* Navigation: mobile menu and keyboard interactions */
function initNavigation() {
  const toggle = $("#menuToggle"),
    nav = $("#nav");
  if (!toggle || !nav) return;
  const set = (open) => {
    nav.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(open));
  };
  toggle.addEventListener("click", () => set(!nav.classList.contains("open")));
  nav.addEventListener("click", (e) => {
    if (e.target.closest("a")) set(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") set(false);
  });
}

/* hCaptcha: set to false to remove the captcha from the contact form.
   Keep it in sync with the hCaptcha option in your Web3Forms dashboard. */
const CAPTCHA_ENABLED = true;

/* Web3Forms enforces hCaptcha per access key (Web3Forms dashboard > your form >
   Block Spam). So the page switches between two keys:
   - KEY_WITH_CAPTCHA:    a key that has hCaptcha ENABLED in the dashboard
   - KEY_WITHOUT_CAPTCHA: a key that has hCaptcha OFF (create a second key on
                          web3forms.com with the same email, leave it empty here
                          until you have it) */
const KEY_WITH_CAPTCHA = "5bcd8047-9d97-4e47-b2b8-fe8d5bf094c3";
const KEY_WITHOUT_CAPTCHA = "";
const HCAPTCHA_SITEKEY = "50b2fe65-b00b-4b9e-ad62-3ba471098be2"; // public Web3Forms free-plan key

/* hCaptcha: lazy loading, error handling, and retry */
function initCaptcha(form) {
  if (!CAPTCHA_ENABLED) return;

  const container = form.querySelector("#captchaContainer");
  const loading = form.querySelector("#captchaLoading");
  const error = form.querySelector("#captchaError");
  const widgetContainer = form.querySelector("#captchaWidget");
  const retryButton = form.querySelector("#captchaRetry");

  if (!container || !loading || !error || !widgetContainer || !retryButton) {
    console.error("Captcha HTML elements are missing.");
    return;
  }

  const d = form.dataset;

  const loadingText = loading.querySelector("span:not(.captcha-spinner)");
  const loadingDetail = loading.querySelector("small");
  const errorTitle = error.querySelector("strong");
  const errorDetail = error.querySelector("small");

  if (!loadingText || !loadingDetail || !errorTitle || !errorDetail) {
    console.error("Captcha message elements are missing.");
    return;
  }

  loadingText.textContent = d.loading || "";
  loadingDetail.textContent = d.wait || "";
  errorTitle.textContent = d.loadError || "";
  errorDetail.textContent = d.errorDetail || "";
  retryButton.textContent = d.retry || "";

  let state = "idle";
  let widgetId = null;
  let attempt = 0;
  let timeoutId = null;
  let scriptElement = null;

  function showLoading() {
    container.hidden = false;
    loading.hidden = false;
    error.hidden = true;
    widgetContainer.hidden = true;
  }

  function showError() {
    state = "error";
    container.hidden = false;
    loading.hidden = true;
    error.hidden = false;
    widgetContainer.hidden = true;
  }

  function failAttempt(currentAttempt, callbackName) {
    if (currentAttempt !== attempt) return;

    attempt++;
    clearTimeout(timeoutId);

    window[callbackName] = () => {};

    if (scriptElement) {
      scriptElement.remove();
      scriptElement = null;
    }

    showError();
  }

  function renderWidget(currentAttempt, callbackName) {
    if (currentAttempt !== attempt) return;

    if (!window.hcaptcha || typeof window.hcaptcha.render !== "function") {
      failAttempt(currentAttempt, callbackName);
      return;
    }

    try {
      widgetContainer.replaceChildren();
      widgetContainer.hidden = false;

      widgetId = window.hcaptcha.render(widgetContainer, {
        sitekey: HCAPTCHA_SITEKEY,
      });

      clearTimeout(timeoutId);

      state = "ready";
      loading.hidden = true;
      error.hidden = true;
      container.hidden = false;

      delete window[callbackName];
    } catch (err) {
      console.error("hCaptcha rendering failed:", err);
      failAttempt(currentAttempt, callbackName);
    }
  }

  function start() {
    if (state === "ready" || state === "loading") return;

    state = "loading";

    const currentAttempt = ++attempt;
    const callbackName = `obHcaptchaReady_${currentAttempt}`;

    showLoading();
    clearTimeout(timeoutId);

    window[callbackName] = () => {
      if (currentAttempt !== attempt) return;
      renderWidget(currentAttempt, callbackName);
    };

    if (window.hcaptcha && typeof window.hcaptcha.render === "function") {
      window[callbackName]();
      return;
    }

    scriptElement = document.createElement("script");

    scriptElement.src = `https://js.hcaptcha.com/1/api.js?render=explicit&onload=${callbackName}&hl=${document.documentElement.lang || "en"}&recaptchacompat=off`;

    scriptElement.async = true;
    scriptElement.defer = true;

    scriptElement.onerror = () => {
      failAttempt(currentAttempt, callbackName);
    };

    timeoutId = setTimeout(() => {
      failAttempt(currentAttempt, callbackName);
    }, 15000);

    document.head.appendChild(scriptElement);
  }

  retryButton.addEventListener("click", start);

  ["focusin", "pointerdown", "touchstart", "keydown"].forEach((type) => {
    form.addEventListener(type, start, { once: true });
  });

  form.captchaState = {
    isReady: () => state === "ready",
    getWidgetId: () => widgetId,
    start,
  };
}

/* Contact form: validation, hCaptcha verification, and Web3Forms submission */
function initContactForm() {
  const form = $("#contactForm");
  if (!form) return;

  initCaptcha(form);

  const status = $("#formStatus");
  const d = form.dataset;

  const say = (message, type = "") => {
    if (!status) return;

    status.textContent = message;
    status.classList.remove("success", "error");

    if (type) status.classList.add(type);
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!form.reportValidity()) return;

    if (CAPTCHA_ENABLED) {
      const captcha = form.captchaState;

      if (!captcha || !captcha.isReady()) {
        say(d.captcha || "", "error");

        if (captcha) {
          captcha.start();
        }

        return;
      }

      const token = form.querySelector('[name="h-captcha-response"]')?.value;

      if (!token) {
        say(d.captcha || "", "error");
        return;
      }
    }

    const data = new FormData(form);

    if (CAPTCHA_ENABLED) {
      data.set("access_key", KEY_WITH_CAPTCHA);
    } else if (KEY_WITHOUT_CAPTCHA) {
      data.set("access_key", KEY_WITHOUT_CAPTCHA);
      data.delete("h-captcha-response");
    } else {
      console.warn(
        "CAPTCHA_ENABLED is false but KEY_WITHOUT_CAPTCHA is empty: " +
          "the form still uses the key that requires hCaptcha, so the server will reject it.",
      );
    }

    if (d.endpoint) {
      const button = form.querySelector('[type="submit"]');

      if (button?.disabled) return;

      const originalText = button?.textContent;

      if (button) {
        button.disabled = true;
        button.textContent = d.sending || "";
      }

      say(d.sending || "");

      try {
        const response = await fetch(d.endpoint, {
          method: "POST",
          headers: { Accept: "application/json" },
          body: data,
        });

        const result = await response.json();

        if (!response.ok || result.success !== true) {
          throw new Error(result.message || "Submission failed");
        }

        form.reset();
        say(d.sent || "", "success");
      } catch (error) {
        console.error("Contact form submission failed:", error);
        say(d.error || "", "error");
      } finally {
        // hCaptcha tokens are single-use: always request a fresh one
        const captcha = form.captchaState;
        const currentWidgetId = captcha?.getWidgetId();

        if (
          window.hcaptcha &&
          captcha &&
          currentWidgetId !== null &&
          currentWidgetId !== undefined
        ) {
          window.hcaptcha.reset(currentWidgetId);
        }

        if (button) {
          button.disabled = false;
          button.textContent = originalText;
        }
      }

      return;
    }

    // Fallback: open a mailto link when no form endpoint is configured
    const label = (id) =>
      (form.querySelector(`label[for="${id}"]`) || {}).textContent || id;

    const body =
      `${label("name")}: ${data.get("name")}\n` +
      `${label("email")}: ${data.get("email")}\n\n` +
      `${data.get("message")}`;

    say(d.status || "");

    window.location.href =
      `mailto:${d.email}?subject=${encodeURIComponent(d.subject || "")}` +
      `&body=${encodeURIComponent(body)}`;
  });
}

/* Reveal elements when they enter the viewport */
function initReveal() {
  const items = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window))
    return items.forEach((i) => i.classList.add("visible"));
  const io = new IntersectionObserver(
    (es) =>
      es.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add("visible");
          io.unobserve(en.target);
        }
      }),
    { threshold: 0.12 },
  );
  items.forEach((i) => io.observe(i));
}

initNavigation();
initContactForm();
initReveal();
