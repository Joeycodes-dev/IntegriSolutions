const { GoogleGenAI } = require("@google/genai");
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) { console.error("NO_API_KEY"); process.exit(1); }
(async () => { try { const ai = new GoogleGenAI({ apiKey }); const response = await ai.models.list({}); const ids = response.models?.map(m => m.name || m.displayName).slice(0, 50); console.log(JSON.stringify(ids, null, 2)); } catch (err) { console.error("ERR", err && err.message || err); process.exit(2); } })();
