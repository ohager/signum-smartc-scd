import { afterEach, describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createStore, Provider } from "jotai";
import { resetMessages, setMessages } from "@/i18n/runtime";
import de from "@/i18n/locales/de";
import { SetupSteps } from "./setup-steps";

afterEach(() => resetMessages());

const target = { port: 6890, origin: "https://smartc-studio.signum-network.dev" };
const CLAUDE = "claude mcp add --scope user smartc-studio -- npx -y @smartc-studio/mcp";

function render() {
  return renderToStaticMarkup(
    <Provider store={createStore()}>
      <SetupSteps target={target} />
    </Provider>,
  );
}

describe("SetupSteps", () => {
  it("shows the Claude Code command by default", () => {
    const html = render();
    expect(html).toContain(CLAUDE);
    expect(html).toContain("npx skills add ohager/signum-smartc-skill -g");
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
    expect(html).toContain(CLAUDE);
    expect(html).toContain((de.assistant as any).connect.setup.register);
  });
});
