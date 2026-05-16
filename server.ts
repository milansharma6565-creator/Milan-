import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Sample routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "TankerWala Server is running" });
  });

  // Phone Sync endpoint mentioned in PhoneSync.tsx
  app.post("/api/sync", (req, res) => {
    console.log("Received sync request:", req.body);
    // In a real app, this would verify the sync key and save to Firestore
    // For now we just return success
    res.json({ status: "PROCESSED", received: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
