import cors from "cors";
import express from "express";
import { createApiRouter } from "./api/router";
import { getEnv } from "./config/env";
import { assertSupabaseReady } from "./db/supabase";
import { getDemoImageSvg } from "./demoImages";
import { attachRequestContext } from "./middleware/requestContext";
import { createPlatformService } from "./runtime";

async function main() {
  const env = getEnv();

  if (!env.demoMode) {
    await assertSupabaseReady(env);
  }

  const service = await createPlatformService(env);

  const app = express();

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || env.corsOrigins.length === 0 || env.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error(`Origin ${origin} is not allowed by Phantom CORS.`));
      },
      credentials: true,
    }),
  );
  app.get("/demo-images/:slug.svg", (request, response) => {
    const svg = getDemoImageSvg(String(request.params.slug ?? ""));
    if (!svg) {
      response.status(404).type("text/plain").send("Demo image not found.");
      return;
    }
    response.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    response.setHeader("Cache-Control", "public, max-age=3600");
    response.send(svg);
  });
  app.use(express.json());
  app.use(attachRequestContext);
  app.use("/api", createApiRouter(service, env));

  app.listen(env.port, () => {
    const modeLabel = env.demoMode ? "demo/in-memory" : "supabase";
    console.log(`API listening on http://localhost:${env.port} (${modeLabel})`);
  });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
