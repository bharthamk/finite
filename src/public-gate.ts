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
      <div class="entry-intro"><p class="eyebrow">One plan at a time</p><h1 id="entry_title">How do you want to begin?</h1><p class="entry-lede">Start with your own words, borrow a useful example, or let Codex walk beside you through the real product.</p></div>
      <div class="entry-route-grid">
        <a class="entry-route entry-route--fresh" data-public-entry="fresh" href="${escapeHtml(signInRoute(signInPath, "/?start=fresh"))}">
          <span>01 / Start fresh</span><strong>Tell Finite what needs to happen.</strong><p>One sentence is enough. Continue into your private workspace, with hints waiting if you want them.</p><em>Start with my plan →</em>
        </a>
        <section class="entry-route entry-route--examples" aria-labelledby="entry_examples_title">
          <span>02 / Start from an example</span><strong id="entry_examples_title">Borrow a useful beginning.</strong><p>Open a temporary example, then change any wording before Finite builds it.</p>
          <div class="entry-example-list">${finiteEntryExamples.map((example) => `<button type="button" data-public-example="${example.id}"><strong>${escapeHtml(example.label)}</strong><small>${escapeHtml(example.detail)}</small><i aria-hidden="true">→</i></button>`).join("")}</div>
        </section>
        <button type="button" class="entry-route entry-route--guided" data-public-entry="guided">
          <span>03 / Walk through with Codex</span><strong>Let Codex show you around, live.</strong><p>It opens the actual product, explains what matters, glows each step and pauses whenever your judgment is needed.</p><em>Start the live walkthrough →</em>
        </button>
      </div>
      <footer class="entry-boundary"><span>Same real product in every route.</span><p>Fresh plans use your ChatGPT identity. Examples and walkthroughs open in an isolated 24-hour workspace.</p></footer>
    </section>
  </main>`;

  const openDemoRoute = async (button: HTMLButtonElement, route: string): Promise<void> => {
    root.querySelectorAll<HTMLButtonElement>("button[data-public-entry], button[data-public-example]").forEach((control) => { control.disabled = true; });
    button.dataset.loading = "true";
    announcer.textContent = "Opening Finite…";
    const response = await fetch("/api/auth/demo", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    if (response.ok) {
      location.assign(route);
      return;
    }
    root.querySelectorAll<HTMLButtonElement>("button[data-public-entry], button[data-public-example]").forEach((control) => { control.disabled = false; });
    delete button.dataset.loading;
    announcer.textContent = "Finite could not open that workspace. Nothing was saved.";
  };

  root.querySelector<HTMLButtonElement>("[data-public-entry='guided']")?.addEventListener("click", (event) => { void openDemoRoute(event.currentTarget as HTMLButtonElement, "/?start=guided"); });
  root.querySelectorAll<HTMLButtonElement>("[data-public-example]").forEach((button) => button.addEventListener("click", () => { void openDemoRoute(button, `/?start=example&example=${encodeURIComponent(button.dataset.publicExample ?? "")}`); }));
};
