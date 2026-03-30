import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../lib/auth.js";

const router = Router();

const chatSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })
  ),
  context: z.string().optional(),
});

router.post("/chat", requireAuth, async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    res.status(503).json({
      error: "NotConfigured",
      message: "El asistente de IA no está configurado todavía. Añade tu OPENAI_API_KEY como variable de entorno.",
    });
    return;
  }

  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ValidationError", message: "Datos no válidos" });
    return;
  }

  const { messages, context } = parsed.data;

  const systemPrompt = `Eres un asistente de soporte técnico especializado en tecnología educativa para HelpDesk Pro.
Ayudas a los usuarios a resolver problemas técnicos, gestionar tickets de soporte y navegar por la plataforma.
Responde siempre en español de manera clara, concisa y profesional.
${context ? `\nContexto adicional: ${context}` : ""}`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        max_tokens: 1024,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const err = await response.json() as any;
      res.status(502).json({ error: "OpenAIError", message: err.error?.message || "Error de OpenAI" });
      return;
    }

    const data = await response.json() as any;
    const reply = data.choices?.[0]?.message?.content || "";

    res.json({ reply, usage: data.usage });
  } catch (err) {
    console.error("AI chat error:", err);
    res.status(500).json({ error: "ServerError", message: "Error al conectar con OpenAI" });
  }
});

export default router;
