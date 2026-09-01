import { finiteEntryExamples } from "./entry-options.js";

const escapeHtml = (value: unknown): string => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

const signInRoute = (signInPath: string, returnTo: string): string => {
  const target = new URL(signInPath, location.origin);
  if (target.origin !== location.origin) return signInPath;
  target.searchParams.set("return_to", returnTo);
  return `${target.pathname}${target.search}${target.hash}`;
};

export const renderPublicGate = (signInPath = "/signin-with-chatgpt"): void => {
  const root = document.querySelector<HTMLElement>("#app");
  const announcer = document.querySelector<HTMLElement>("#announcer");
  if (!root || !announcer) throw new Error("Finite host elements are missing.");
  document.title = "Finite — begin a plan";
  root.setAttribute("aria-busy", "false");
  root.innerHTML = `<main class="entry-shell" id="main">
    <section class="entry-card entry-card--product" aria-labelledby="entry_title">
      <header class="entry-card__top"><a class="brand" href="#main" aria-label="Finite home"><img src="/finite-wordmark.png" width="98" height="30" alt=""></a></header>
      <div class="entry-intro"><p class="eyebrow">Adaptive planning</p><h1 id="entry_title">Plans that survive contact with reality.</h1><p class="entry-lede">See a live plan absorb one disruptive change, or begin with something you need to make happen.</p></div>
      <div class="entry-route-grid">
        <a class="entry-route entry-route--fresh" data-public-entry="fresh" href="${escapeHtml(signInRoute(signInPath, "/?start=fresh"))}">
          <span>01 / Start fresh</span><strong>Tell Finite what needs to happen.</strong><p>One sentence is enough. Continue into your private workspace, with hints waiting if you want them.</p><em>ChatGPT sign-in required · Start with my plan →</em>
        </a>
        <section class="entry-route entry-route--examples" aria-labelledby="entry_examples_title">
          <span>02 / Start from a template</span><strong id="entry_examples_title">Choose a template.</strong><p>Pick a ready-made starting point and tailor it to your plan.</p>
          <div class="entry-example-list">${finiteEntryExamples.map((example) => `<button type="button" data-public-example="${example.id}"><strong>${escapeHtml(example.label)}</strong><small>${escapeHtml(example.detail)}</small><i aria-hidden="true">→</i></button>`).join("")}</div>
        </section>
        <button type="button" class="entry-route entry-route--codex-live" data-public-entry="codex-live">
          <span>03 / Use Codex live</span><strong>Build with Codex beside you.</strong><p>Codex runs Finite, explains what it is doing and pauses whenever it needs your input.</p><em>Use Codex live →</em>
        </button>
        <button type="button" class="entry-route entry-route--live-demo" data-public-entry="live-demo">
          <span>04 / Recommended · under 3 minutes</span><strong>See Finite adapt.</strong><p>Watch WebMCP model one real plan change, then choose what the plan becomes before Codex can apply it.</p><em>Run the live decision →</em>
        </button>
      </div>
      <p class="entry-route-status" data-public-entry-status role="status" hidden></p>
      <footer class="entry-boundary"><div><span>Same real product in every route.</span><p>Spotlight and guided tours stay in this browser. Fresh plans use your ChatGPT identity; templates open in an isolated 24-hour workspace.</p></div><button type="button" class="text-button" data-public-entry="full-demo">Explore the longer guided tour</button></footer>
    </section>
  </main>`;

  const openDemoRoute = async (button: HTMLButtonElement, route: string): Promise<void> => {
    const status = root.querySelector<HTMLElement>("[data-public-entry-status]");
    root.querySelectorAll<HTMLButtonElement>("button[data-public-entry], button[data-public-example]").forEach((control) => { control.disabled = true; });
    root.setAttribute("aria-busy", "true");
    button.dataset.loading = "true";
    announcer.textContent = "Opening Finite…";
    if (status) {
      status.hidden = false;
      status.textContent = "Opening an isolated Finite workspace…";
    }
    try {
      const response = await fetch("/api/auth/demo", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      if (response.ok) {
        location.assign(route);
        return;
      }
    } catch {
      // The visible retry state below is the product recovery path.
    }
    root.querySelectorAll<HTMLButtonElement>("button[data-public-entry], button[data-public-example]").forEach((control) => { control.disabled = false; });
    root.setAttribute("aria-busy", "false");
    delete button.dataset.loading;
    announcer.textContent = "Finite could not open that workspace. Nothing was saved.";
    if (status) status.textContent = "That isolated workspace could not be opened. Nothing was saved. Please try again.";
  };

  root.querySelector<HTMLButtonElement>("[data-public-entry='codex-live']")?.addEventListener("click", (event) => { void openDemoRoute(event.currentTarget as HTMLButtonElement, "/?start=codex-live"); });
  root.querySelector<HTMLButtonElement>("[data-public-entry='live-demo']")?.addEventListener("click", () => { location.assign("/?start=live-demo&tour=spotlight&plan=1"); });
  root.querySelector<HTMLButtonElement>("[data-public-entry='full-demo']")?.addEventListener("click", () => { location.assign("/?start=live-demo&tour=standard"); });
  root.querySelectorAll<HTMLButtonElement>("[data-public-example]").forEach((button) => button.addEventListener("click", () => { void openDemoRoute(button, `/?start=example&example=${encodeURIComponent(button.dataset.publicExample ?? "")}`); }));
};
