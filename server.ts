import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Sample routes
  app.get("/api/health", (req, res) => {
    res.status(200).json({ status: "ok", message: "TankerWala Server is running" });
  });

  // Phone Sync endpoint mentioned in PhoneSync.tsx
  app.post("/api/sync", (req, res) => {
    console.log("Received sync request:", req.body);
    res.status(200).json({ status: "PROCESSED", received: true });
  });

  console.log("NODE ENV is", process.env.NODE_ENV);
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
    app.get("*all", (req, res) => {
      try {
        res.sendFile(path.join(distPath, "index.html"));
      } catch (err) {
        console.error("Error serving index.html:", err);
        res.status(500).send("Internal Server Error");
      }
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
