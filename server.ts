import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API Sample routes
  app.get("/api/health", (req, res) => {
    res.status(200).json({ status: "ok", message: "TankerWala Server is running" });
  });

  // Phone Sync endpoint mentioned in PhoneSync.tsx
  app.post("/api/sync", (req, res) => {
    console.log("Received sync request:", req.body);
    res.status(200).json({ status: "PROCESSED", received: true });
  });

  // Letterhead/AI Generation Endpoint
  app.post("/api/generate-letter", async (req, res) => {
    try {
      const { prompt, fileData, mimeType } = req.body;
      if (!prompt && !fileData) {
        return res.status(400).json({ error: "No prompt or file provided" });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
      }

      const { GoogleGenAI } = await import("@google/genai");
      const client = new GoogleGenAI({ 
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });
      
      const parts: any[] = [];
      
      if (fileData && mimeType) {
        try {
          if (mimeType.includes("wordprocessingml.document") || mimeType.includes("msword")) {
            const mammoth = await import("mammoth");
            const buffer = Buffer.from(fileData, "base64");
            const result = await mammoth.extractRawText({ buffer });
            parts.push({ text: `REFERENCE DOCUMENT CONTENT:\n${result.value}` });
          } else if (mimeType.includes("spreadsheetml.sheet") || mimeType.includes("ms-excel")) {
            const xlsx = await import("xlsx");
            const buffer = Buffer.from(fileData, "base64");
            const workbook = xlsx.read(buffer, { type: "buffer" });
            let docText = "";
            workbook.SheetNames.forEach((sheetName: string) => {
              docText += `\nSheet: ${sheetName}\n`;
              docText += xlsx.utils.sheet_to_csv(workbook.Sheets[sheetName]);
            });
            parts.push({ text: `REFERENCE SPREADSHEET CONTENT:\n${docText.slice(0, 15000)}` });
          } else if (mimeType.includes("pdf") || mimeType.includes("image/")) {
             parts.push({
               inlineData: {
                 data: fileData,
                 mimeType: mimeType === "application/pdf" ? "application/pdf" : mimeType
               }
             });
          } else if (mimeType.includes("text/plain")) {
             const text = Buffer.from(fileData, "base64").toString("utf-8");
             parts.push({ text: `REFERENCE TEXT CONTENT:\n${text}` });
          }
        } catch (e) {
          console.error("Failed to parse document on server:", e);
        }
      }
      
      parts.push({
        text: `You are a professional business letter writer for "TankerWala" (A Water Supply Service).
Write a formal, well-structured business letter body based on the instructions below.
The output should ONLY contain the body of the letter. 
Do NOT include header, date, or address info.
The user language might be Hindi or English - respond in the same language.

Instructions/Prompt: ${prompt || "Draft a professional letter based on the attached document context."}`
      });

      const response = await client.models.generateContent({
        model: "gemini-flash-latest", 
        contents: [{ role: "user", parts: parts }],
        config: {
          temperature: 0.7,
        }
      });
      
      const text = response.text || "I was unable to generate the content.";
      res.status(200).json({ text });
    } catch (err: any) {
      console.error("Error generating letter:", err);
      res.status(500).json({ error: err.message || "Failed to generate letter" });
    }
  });

  // Support AI Assistant Chat Route
  app.post("/api/ai/chat", async (req, res) => {
    try {
      const { messages } = req.body;
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "Messages array is required." });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not configured on this server." });
      }

      const { GoogleGenAI } = await import("@google/genai");
      const client = new GoogleGenAI({ 
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });

      const systemInstruction = `You are "TankerWala AI Sahayak", the official AI-powered franchise helper assistant for the TankerWala Water Delivery & Smart Billing platform. 
Your goal is to solve every problem experienced by the franchise owner or operator. This includes troubleshooting driver synchronization issues, tractor allocation, billing category updates, monthly pass issues, and customer locations.

Key Information & Guidelines:
1. CUSTOMER PORTAL & BOOKING:
- Customers can book Single Trip Water Tankers, Standard Cans (₹30 each + distance cost), Monthly Passes of 20L Water Cans (₹600 flat with FREE Hot & Cold water dispenser), and Packaged Bottles.
- If a customer clicks "Find My Location", exact latitude and longitude coordinates are fetched and printed in green underneath the button.
- On Driver Portal, driver clicks "Reached on Location" and a loud siren alarm sounds on the customer's portal immediately to notify them of delivery.

2. DRIVER & TRACTOR DATA SYNC:
- If a driver says the dashboard status isn't syncing, explain that the dashboard considers status like "Assigned", "Active", "Filling", "On the way" and "Reached" as "busy". If the sync is sluggish, restarting or toggling their trip status on the Driver App fixes it instantly.

3. BILLING:
- Thermal Invoices (thermal bills) automatically write accurate customized descriptions like:
  * "20L RO Water Can"
  * "20L RO Water Can (Monthly Plan)"
  * "Packaged Water"
  * "Tanker XYZ L"
- View bills on the customer portal and driver portal are designed to match the highly professional Franchise thermal invoices exactly.

4. PORTAL THEME:
- Both Customer Portal and Driver Portal use a clean, modern, white, fully mobile-friendly theme.

Your tone should be highly professional, polite, warm, and helpful. Respond in simple, natural Hinglish (Hindi + English mix) or English depending on how the user prompts you, because franchise owners in India prefer natural Hinglish for quick help.
Keep answers concise, clear, and action-oriented!`;

      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: messages.map(m => ({
          role: m.role,
          parts: [{ text: m.content }]
        })),
        config: {
          systemInstruction,
          temperature: 0.7,
        }
      });

      const text = response.text || "I'm sorry, I encountered an issue processing that. Please try again.";
      res.status(200).json({ text });
    } catch (err: any) {
      console.error("AI Assistant Chat Error:", err);
      res.status(500).json({ error: err.message || "Something went wrong in the AI Helper." });
    }
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
