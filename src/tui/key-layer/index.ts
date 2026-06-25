/**
 * @module 键位层级 | TUI 键盘输入的优先级处理、层级栈管理、事件传播
 */

import { createSignal, untrack } from "solid-js";
import type { GameClient } from "../client/types.ts";
import { ALL_LAYERS, BASE_LAYER } from "./layers.ts";
import type { KeyBinding, KeyLayer } from "./types.ts";

export * from "./actions.ts";
export * from "./direction.ts";
export * from "./handlers.ts";
export * from "./layers.ts";
export type { KeyBinding, KeyLayer } from "./types.ts";

// ── Stack Management (Solid.js signal) ──
// 图层栈用 Solid.js signal 管理，pushLayer 按 priority 降序排列。
// 新图层入栈时，priority 低于它的旧图层被移除（被"覆盖"）。

const [layerStack, setLayerStack] = createSignal<KeyLayer[]>([BASE_LAYER]);

export function pushLayer(id: string): void {
  const layer = ALL_LAYERS[id];
  if (!layer || layer.id === "base") return;
  setLayerStack((prev) => {
    const kept = prev.filter(
      (l) => l.id === "base" || (l.id !== id && l.priority > layer.priority),
    );
    const result = [layer, ...kept];
    result.sort((a, b) => b.priority - a.priority);
    return result;
  });
}

export function popLayer(id: string): void {
  setLayerStack((prev) => prev.filter((l) => l.id !== id));
}

export function hasLayer(id: string): boolean {
  return layerStack().some((l) => l.id === id);
}

export function activeLayer(): KeyLayer {
  return layerStack()[0] ?? BASE_LAYER;
}

export function getLayerStack(): KeyLayer[] {
  return layerStack();
}

// ── Key Dispatch ──
// 唯一的按键分发入口。从栈顶向下遍历，第一个匹配的 binding 执行。
// passthrough=false 的图层消费所有未匹配按键（模态行为）。

function matchKey(pattern: string | string[], name: string): boolean {
  const patterns = Array.isArray(pattern) ? pattern : [pattern];
  for (const p of patterns) {
    if (p === name) return true;
    if (p === "1-9" && name.length === 1 && name >= "1" && name <= "9") return true;
    if (p === "a-z" && name.length === 1 && name >= "a" && name <= "z") return true;
  }
  return false;
}

export function dispatchKey(
  key: { name: string; meta?: boolean; preventDefault: () => void },
  client: GameClient,
): void {
  if (key.meta && key.name.toLowerCase() === "c") return;
  if (client.hasActiveRequest() || client.settlementPending()) {
    const currentLayer = activeLayer();
    const name = key.name.toLowerCase();
    if (currentLayer.id === "dialogue" && (name === "left" || name === "right")) {
    } else {
      key.preventDefault();
      return;
    }
  }

  const name = key.name.toLowerCase();
  const stack = untrack(() => layerStack());

  for (const layer of stack) {
    for (const b of layer.bindings) {
      if (!matchKey(b.key, name)) continue;
      if (b.enabled && !b.enabled(client)) continue;
      if (b.handler) {
        const handled = b.handler(client, name) as unknown;
        if (handled === false) continue;
      }
      if (b.action) client.execute(b.action, b.params);
      key.preventDefault();
      return;
    }
    if (!layer.passthrough) {
      key.preventDefault();
      return;
    }
  }
}

// ── For Sidebar ──

export function getGlobalBindings(): KeyBinding[] {
  return BASE_LAYER.bindings.filter((b) => b.group === "global");
}
