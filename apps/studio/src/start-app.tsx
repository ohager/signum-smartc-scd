import type { ComponentType } from "react";
import { t } from "@/i18n/runtime";

interface Deps {
  /** The element holding the splash, which the app (or the error) replaces. */
  root: HTMLElement;
  importApp: () => Promise<{ App: ComponentType }>;
  render: (App: ComponentType) => void;
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * Loads the app chunk and hands it to `render`. When the chunk cannot be
 * fetched — offline, or a tab left open across a deploy that renamed it — the
 * splash would otherwise breathe forever; it is replaced by a message and a
 * reload button in the active language. Plain HTML with inline styles: the
 * app's stylesheet came with the chunk that failed.
 */
export async function startApp({ root, importApp, render }: Deps): Promise<void> {
  try {
    const { App } = await importApp();
    render(App);
  } catch (error) {
    console.error("[studio] the app could not be loaded", error);
    root.innerHTML =
      `<div role="alert" style="position:fixed;inset:0;display:grid;place-content:center;gap:16px;` +
      `padding:16px;text-align:center;font:14px/1.6 system-ui,sans-serif;color:var(--rg-2,#00aaff)">` +
      `<p style="margin:0;max-width:40ch">${escapeHtml(t("common.boot.failed"))}</p>` +
      `<button type="button" onclick="location.reload()" style="justify-self:center;padding:6px 14px;` +
      `font:inherit;color:inherit;background:transparent;border:1px solid currentColor;cursor:pointer">` +
      `${escapeHtml(t("common.boot.reload"))}</button></div>`;
  }
}
