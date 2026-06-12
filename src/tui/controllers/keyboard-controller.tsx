// ── KeyboardController ──
// TUI 唯一键盘入口。所有 useKeyboard 调用集中在此组件。
// Meta+C → OSC 52 剪贴板复制，其他键 → dispatchKey(key, client)。
// 面板不直接监听键盘，只声明需要的动作，由 key-layer 统一分发。
// 渲染 null（headless 组件），作为 App 的子组件挂载。

import { useKeyboard, useRenderer } from "@opentui/solid";
import type { GameClient } from "../client/game-client.ts";
import { dispatchKey } from "../key-layer/index.ts";

export function KeyboardController(props: { client: GameClient }) {
  const renderer = useRenderer();

  useKeyboard((key) => {
    const name = key.name.toLowerCase();

    if (key.meta && name === "c") {
      const selection = renderer.getSelection();
      if (selection) {
        const text = selection.getSelectedText();
        if (text) {
          renderer.copyToClipboardOSC52(text);
          key.preventDefault();
          return;
        }
      }
    }

    dispatchKey(key, props.client);
  });

  return null;
}
