import { afterEach, describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createStore, Provider } from "jotai";
import { resetMessages, setMessages } from "@/i18n/runtime";
import de from "@/i18n/locales/de";
import { SetupSteps } from "./setup-steps";

afterEach(() => resetMessages());

const target = { port: 6890, origin: "https://smartc-studio.signum-network.dev" };
const PLUGIN = "claude plugin install signum-smartc --marketplace ohager/signum-smartc-skill";

function render(t = target) {
  return renderToStaticMarkup(
    <Provider store={createStore()}>
      <SetupSteps target={t} />
    </Provider>,
  );
}

describe("SetupSteps", () => {
  it("shows the Claude Code plugin by default", () => {
    const html = render();
    expect(html).toContain(PLUGIN);
    expect(html).not.toContain("claude mcp add");
    expect(html).not.toContain("npx skills add");
  });

  it("shows the manual commands when the plugin's relay cannot reach this Studio", () => {
    const html = render({ port: 6999, origin: target.origin });
    expect(html).toContain("claude mcp add --scope user smartc-studio -- npx -y @smartc-studio/mcp --port 6999");
    expect(html).toContain("npx skills add ohager/signum-smartc-skill -g");
    expect(html).not.toContain(PLUGIN);
  });

  it("wraps long commands", () => {
    expect(render()).toMatch(/<code[^>]*class="[^"]*break-all/);
  });

  it("scrolls the steps itself so Connect stays reachable on short screens", () => {
    expect(render()).toMatch(/class="[^"]*max-h-\[[^"]*overflow-y-auto/);
  });

  it("keeps commands untranslated", () => {
    setMessages("de", de);
    const html = render();
    expect(html).toContain(PLUGIN);
    expect(html).toContain((de.assistant as any).connect.setup.plugin);
  });
});
