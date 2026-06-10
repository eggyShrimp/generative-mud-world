import { render } from "@opentui/solid";
import { App } from "./app.tsx";
import { createGameClient } from "./game-client.ts";

const serverUrl = process.env.WORLD_WS_URL ?? "ws://localhost:3000";
const client = createGameClient(serverUrl);

await render(() => <App client={client} />);
