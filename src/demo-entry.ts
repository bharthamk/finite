/** One demo entry contract for the public and signed-in home screens. */
export const demoExplorePath = "/?start=explore-demo&plan=1&fresh=1";

export const renderDemoEntryCard = (surface: "public" | "workspace"): string => `
  <button type="button" class="entry-route entry-route--live-demo" ${surface === "public" ? 'data-public-entry="live-demo"' : 'data-entry-action="live-demo"'} data-demo-entry-open aria-expanded="false" aria-controls="entry_demo_picker">
    <span>04 / Demo mode</span><strong>Try Finite.</strong><p>Explore an example plan without changing your saved work. Try it yourself or let Codex walk you through it.</p><em>Open demo mode →</em>
  </button>`;

export const renderDemoEntryPicker = (): string => `
  <section class="entry-demo-picker" id="entry_demo_picker" aria-labelledby="entry_demo_picker_title" hidden>
    <header><div><p class="eyebrow">Demo mode</p><h2 id="entry_demo_picker_title">How would you like to try Finite?</h2><p>Both options use a separate workspace in this browser. Your saved plans stay untouched. Demo changes stay here; sharing and uploads are unavailable.</p></div><button type="button" data-demo-entry-close aria-label="Close demo choices">×</button></header>
    <div class="demo-entry-choices">
      <a class="demo-entry-manual" href="${demoExplorePath}" data-demo-explore><span>No sign-in or Codex needed</span><strong>Explore myself</strong><p>Open a sample Europe trip. Edit the plan, try the controls and see how the connected details change.</p><em>Open the example plan →</em></a>
      <details class="demo-entry-guided">
        <summary><span>Codex and a WebMCP-capable browser required</span><strong>Guide me with Codex</strong><p>Codex walks through the real product with you, pausing for your choices and questions.</p><em>Choose a guided tour ↓</em></summary>
        <div class="demo-entry-tours" aria-label="Guided demo lengths">
          <a href="/?start=live-demo&tour=spotlight&plan=1" data-demo-depth="spotlight"><strong>See Finite adapt</strong><span>One decision · under 3 minutes</span><p>Change a live Europe plan and choose the trade-off.</p></a>
          <a href="/?start=live-demo&tour=basics" data-demo-depth="basics"><strong>Just the basics</strong><span>2 chapters · about 3 minutes</span><p>Build a tailored, editable plan from a template.</p></a>
          <a href="/?start=live-demo&tour=standard" data-demo-depth="standard"><strong>Standard tour</strong><span>6 chapters · about 8 minutes</span><p>Build, manage and adapt a Hobart trip.</p></a>
          <a href="/?start=live-demo&tour=complete" data-demo-depth="complete"><strong>All the bells &amp; whistles</strong><span>8 chapters · about 12 minutes</span><p>Add a custom tracker and compare ideas too.</p></a>
        </div>
      </details>
    </div>
  </section>`;

export const bindDemoEntry = (root: HTMLElement): void => {
  const opener = root.querySelector<HTMLButtonElement>("[data-demo-entry-open]");
  const picker = root.querySelector<HTMLElement>("#entry_demo_picker");
  if (!opener || !picker) return;
  opener.addEventListener("click", () => {
    picker.hidden = false;
    opener.setAttribute("aria-expanded", "true");
    picker.querySelector<HTMLAnchorElement>("[data-demo-explore]")?.focus();
  });
  picker.querySelector<HTMLButtonElement>("[data-demo-entry-close]")?.addEventListener("click", () => {
    picker.hidden = true;
    opener.setAttribute("aria-expanded", "false");
    opener.focus();
  });
};
