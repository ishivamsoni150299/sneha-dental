import type { VercelRequest, VercelResponse } from '@vercel/node';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequestBody {
  message: string;
  clinicName?: string;
  services?: string[];
  history?: ChatMessage[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin ?? '';
  const allowed = ['https://mydentalplatform.com', 'https://www.mydentalplatform.com'];
  if (allowed.includes(origin) || origin.endsWith('.mydentalplatform.com')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) return res.status(503).json({ error: 'AI chat not configured' });

  const body = req.body as ChatRequestBody;
  const { message, clinicName = 'our clinic', services = [], history = [] } = body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'message is required' });
  }

  const systemPrompt = `You are a warm, helpful AI receptionist for ${clinicName}, a dental clinic.
Your role: answer questions about services, guide patients to book appointments, and provide friendly dental info.
${services.length > 0 ? `Services offered: ${services.join(', ')}.` : ''}
Rules:
- Keep replies concise (2-3 sentences max)
- Always be encouraging about booking when relevant
- If asked something unrelated to dental care, politely redirect
- Use simple, friendly language — no medical jargon
- If asked about prices, suggest calling or booking a consultation`;

  const messages: ChatMessage[] = [
    ...history.slice(-10), // keep last 10 messages for context
    { role: 'user', content: message.trim() },
  ];

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 250,
        system: systemPrompt,
        messages,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('[chat] Claude API error:', response.status, err);
      return res.status(502).json({ error: 'AI service unavailable' });
    }

    const data = await response.json() as { content?: { type: string; text: string }[] };
    const reply = data.content?.find(c => c.type === 'text')?.text ?? 'Sorry, I could not process that. Please try again.';

    return res.status(200).json({ reply });
  } catch (e) {
    console.error('[chat] Unexpected error:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
}
