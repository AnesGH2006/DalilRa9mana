---
name: Free LLM via Groq
description: How to add a chat/LLM feature with no ongoing API cost when the user doesn't want to pay for OpenAI billing.
---

Replit's managed passthrough billing (the `external-apis` skill) covers search, image, audio, and 3D generation APIs, but has no text/chat LLM connector, and no first-party Replit integration exists for OpenAI/Anthropic/Gemini chat either.

When a user wants an AI chat/assistant feature without setting up OpenAI billing, use Groq instead:
- Groq exposes a free-tier, OpenAI-compatible Chat Completions API.
- Reuse the `openai` npm package, just point it at Groq: `new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" })`.
- Use a Groq-hosted model id (e.g. `llama-3.3-70b-versatile`), not an OpenAI model id like `gpt-4o-mini`.
- Request the `GROQ_API_KEY` secret from the user the same way as any other secret (via requestSecrets); it is a separate key from `OPENAI_API_KEY`.

**Why:** the user's OpenAI key was valid but the account had no billing/credits (`insufficient_quota`), and they didn't want to pay — Groq removed the cost blocker without changing any app code beyond the client's `baseURL`/`apiKey`/model.

**How to apply:** default to asking whether the user wants to pay for OpenAI or use a free Groq-backed model when scoping any new AI/chat feature, instead of assuming OpenAI billing is available.
