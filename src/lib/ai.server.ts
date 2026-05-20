// Server-only helpers that call the Lovable AI Gateway.
// Do NOT import from client code.

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
};

type ToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export async function callAIWithTool<T>(opts: {
  model: string;
  messages: ChatMessage[];
  tool: ToolDef;
}): Promise<T> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      tools: [opts.tool],
      tool_choice: { type: "function", function: { name: opts.tool.function.name } },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("Rate limit. Try again in a moment.");
    if (res.status === 402)
      throw new Error("AI credits exhausted. Add credits in Workspace Settings.");
    throw new Error(`AI gateway error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const call = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) throw new Error("No tool call returned by model");
  try {
    return JSON.parse(call.function.arguments) as T;
  } catch {
    throw new Error("Model returned invalid JSON");
  }
}

export async function generateImage(opts: {
  prompt: string;
  model?: string;
}): Promise<{ base64: string; mimeType: string }> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model ?? "google/gemini-3.1-flash-image-preview",
      messages: [
        {
          role: "user",
          content: opts.prompt,
        },
      ],
      modalities: ["image", "text"],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Image gen error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const images = data?.choices?.[0]?.message?.images;
  const url: string | undefined = images?.[0]?.image_url?.url;
  if (!url) throw new Error("No image returned");
  // data URL: data:image/png;base64,XXXX
  const match = url.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Bad image URL format");
  return { mimeType: match[1], base64: match[2] };
}
