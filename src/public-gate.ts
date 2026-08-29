const escapeHtml = (value: unknown): string => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

export const renderPublicGate = (signInPath = "/signin-with-chatgpt"): void => {
  const root = document.querySelector<HTMLElement>("#app");
  const announcer = document.querySelector<HTMLElement>("#announcer");
  if (!root || !announcer) throw new Error("Finite host elements are missing.");
  document.title = "Finite — plans that survive contact with reality";
  root.setAttribute("aria-busy", "false");
  root.innerHTML = `<div class="public-surface"><header class="public-header"><a class="brand" href="#main" aria-label="Finite home"><img src="/finite-wordmark.png" width="98" height="30" alt=""></a></header><main class="public-main" id="main"><section class="public-entry" aria-labelledby="entry_title"><div><p class="eyebrow">Adaptive planning with Codex</p><h1 id="entry_title">Bring the plan that cannot afford to fall apart.</h1><p>Continue with ChatGPT for a private workspace, or open a separate 24-hour demo.</p></div><div class="public-entry__actions"><a class="button button--entry" href="${escapeHtml(signInPath)}">Continue with ChatGPT</a><button class="button button--demo" data-action="start-demo">Try the demo</button></div></section></main></div>`;
  root.querySelector<HTMLButtonElement>("[data-action='start-demo']")?.addEventListener("click", async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    button.textContent = "Opening the demo…";
    const response = await fetch("/api/auth/demo", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    if (response.ok) location.reload();
    else { button.disabled = false; button.textContent = "Try the demo"; announcer.textContent = "The demo could not be opened. Nothing was saved."; }
  });
};
