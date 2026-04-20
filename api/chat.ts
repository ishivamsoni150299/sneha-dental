import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildAgentSystemPrompt } from './_lib/elevenlabs-agent-config';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequestBody {
  message: string;
  clinicName?: string;
  services?: string[];
  city?: string;
  phone?: string;
  address?: string;
  hours?: string[];
  whatsappNumber?: string;
  history?: ChatMessage[];
}

function buildFallbackReply(body: ChatRequestBody): string {
  const clinicName = body.clinicName?.trim() ?? 'our clinic';
  const message = body.message.trim().toLowerCase();
  const serviceList = body.services?.filter(Boolean).slice(0, 4) ?? [];
  const listedServices = serviceList.join(', ');
  const phone = body.phone?.trim() ?? '';
  const whatsappNumber = body.whatsappNumber?.trim() ?? '';
  const hours = body.hours?.filter(Boolean).slice(0, 3) ?? [];
  const hoursLine = hours.join(', ');

  if (/(book|appointment|schedule|slot|visit|consult)/i.test(message)) {
    return `I can help you book with ${clinicName}. Use the Book Appointment button and share your preferred treatment, day, and time, and the clinic will confirm the best available slot${whatsappNumber ? ` on WhatsApp (+${whatsappNumber})` : ''}.`;
  }

  if (/(price|cost|fee|fees|charge|charges)/i.test(message)) {
    return 'Pricing depends on the treatment and your case, so the fastest next step is to book a consultation or call the clinic for today\'s pricing. I can still help you choose the right appointment type.';
  }

  if (/(hour|time|open|close|timing|today)/i.test(message)) {
    return hoursLine
      ? `${clinicName} currently shows timings like ${hoursLine}. For the latest availability, use the call or WhatsApp action on this site.`
      : `Clinic timings can vary by day, so the safest option is to use the call or WhatsApp action on this site for the latest availability. If you want, I can still help you prepare a booking request for ${clinicName}.`;
  }

  if (/(service|treatment|whitening|implant|braces|cleaning|root canal|filling|extraction)/i.test(message)) {
    return listedServices
      ? `${clinicName} currently offers services such as ${listedServices}. Tell me the dental issue you are facing and I will guide you to the most relevant appointment request.`
      : `I can help you find the right treatment at ${clinicName}. Tell me what issue you are facing, and I will guide you toward the best appointment request.`;
  }

  if (/(contact|call|phone|whatsapp|address|location|map|directions)/i.test(message)) {
    return `You can reach ${clinicName}${phone ? ` on ${phone}` : ''} from the Contact page, the Call action, or the WhatsApp button on this site. If you want, I can also help you figure out which treatment to book before you contact the clinic.`;
  }

  return `I can help with treatments, appointments, timings, and next steps for ${clinicName}. Ask about booking, services, pricing, or contact details and I will keep it short and useful.`;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<VercelResponse> {
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
  const body = req.body as ChatRequestBody;
  const { message, clinicName = 'our clinic', services = [], history = [] } = body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'message is required' });
  }

  if (!apiKey) {
    return res.status(200).json({
      reply: buildFallbackReply(body),
      fallback: true,
    });
  }

  const systemPrompt = `${buildAgentSystemPrompt({
    name: clinicName,
    services: services.map(name => ({ name })),
    city: body.city,
    phone: body.phone,
    addressLine1: body.address,
    hours: (body.hours ?? []).map(slot => ({ days: slot, time: '' })),
    whatsappNumber: body.whatsappNumber,
  })}

CHANNEL CONTEXT:
- This is the website text chat on ${clinicName}'s clinic website.
- If the patient wants to book, guide them to the Book Appointment button or collect their name, phone, preferred date or time, and treatment so the clinic can follow up.
- Keep replies short and natural for typed chat.`;

  const messages: ChatMessage[] = [
    ...history.slice(-10),
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
