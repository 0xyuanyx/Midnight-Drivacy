import { createApp } from "./app.js";
import { loadEnvironment } from "./config/env.js";

const { port } = loadEnvironment();
const app = createApp();

app.listen(port, () => {
  console.info(`Drivacy backend listening on port ${port}`);
});
