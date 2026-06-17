import { render } from "@opentui/solid";
import { wsUrl } from "../shared/config.ts";
import { App } from "./app.tsx";
import { createGameClient } from "./client/game-client.ts";

const client = createGameClient(wsUrl);

await render(() => <App client={client} />);
