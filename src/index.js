import { createApp } from "./app.js";
import { config } from "./config.js";

const server = createApp(config);

server.listen(config.port, () => {
  console.log(`🚀 Server running at http://localhost:${config.port}`);
  console.log(`   Try: curl -i http://localhost:${config.port}/products/1   (run it twice!)`);
});

// Shut down cleanly on Ctrl+C.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    console.log("\nShutting down...");
    server.close(() => process.exit(0));
  });
}
