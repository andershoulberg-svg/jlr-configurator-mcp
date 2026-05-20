import { getConfig } from "./config.js";
import { startHttpServer } from "./httpServer.js";
import { startStdioServer } from "./stdioServer.js";

const config = getConfig();

if (config.transport === "http") {
  startHttpServer(config);
} else {
  startStdioServer();
}

