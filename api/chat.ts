import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomBytes } from 'crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { buildAgentSystemPrompt } from './_lib/elevenlabs-agent-config';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequestBody {
  clinicId?: string;
  bookingRefPrefix?: string;
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

interface ExtractedBookingRequest {
  intent: boolean;
  name: string;
  phone: string;
  email: string;
  service: string;
  preferredDate: string;
  preferredTime: string;
  rawUserConversation: string;
}

const hasFirebaseAdminConfig = Boolean(
  process.env['FIREBASE_PROJECT_ID']?.trim()
    && process.env['FIREBASE_CLIENT_EMAIL']?.trim()
    && process.env['FIREBASE_PRIVATE_KEY']?.trim(),
);

if (hasFirebaseAdminConfig && !getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env['FIREBASE_PROJECT_ID'],
      clientEmail: process.env['FIREBASE_CLIENT_EMAIL'],
      privateKey: process.env['FIREBASE_PRIVATE_KEY']?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getApps().length ? getFirestore() : null;

function normalizePhone(value: string): string {
  const cleaned = value.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.length === 12 && cleaned.startsWith('91')) return `+${cleaned}`;
  return cleaned;
}

function generateBookingRef(prefix: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = randomBytes(8);
  const suffix = Array.from(bytes, value => chars[value % chars.length]).join('');
  return `${prefix}-${suffix}`;
}

function collectUserConversation(body: ChatRequestBody): string {
  const turns = [
    ...(body.history ?? [])
      .filter(message => message.role === 'user')
      .map(message => message.content.trim())
      .filter(Boolean),
    body.message.trim(),
  ];

  return turns.join('\n');
}

function hasExistingBookingConfirmation(history: ChatMessage[]): boolean {
  return history.some(message =>
    message.role === 'assistant'
    && /booking ref|booking reference|request has been submitted/i.test(message.content),
  );
}

function extractName(text: string): string {
  const patterns = [
    /(?:my name is|i am|this is|name is)\s+([A-Za-z][A-Za-z\s'.-]{1,40})/i,
    /(?:patient name|name)\s*[:\-]\s*([A-Za-z][A-Za-z\s'.-]{1,40})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].trim().replace(/\s+/g, ' ');
    }
  }

  return '';
}

function extractPhone(text: string): string {
  const labeled = text.match(/(?:phone|mobile|number|contact)\D*(\+?\d[\d\s-]{7,16}\d)/i);
  if (labeled?.[1]) return normalizePhone(labeled[1]);

  const standalone = text.match(/(?:^|\s)(\+?\d[\d\s-]{9,16}\d)(?:\s|$)/);
  if (standalone?.[1]) return normalizePhone(standalone[1]);

  return '';
}

function extractEmail(text: string): string {
  const match = text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  return match?.[0]?.trim() ?? '';
}

function extractService(text: string, services: string[]): string {
  const normalized = text.toLowerCase();

  for (const service of services) {
    const trimmed = service.trim();
    if (trimmed && normalized.includes(trimmed.toLowerCase())) {
      return trimmed;
    }
  }

  const keywords: Array<[RegExp, string]> = [
    [/root canal/i, 'Root Canal'],
    [/implant/i, 'Dental Implants'],
    [/braces|aligner|orthodontic/i, 'Orthodontics'],
    [/cleaning|scaling/i, 'Cleaning & Scaling'],
    [/whitening/i, 'Teeth Whitening'],
    [/filling|cavity/i, 'Tooth Fillings'],
    [/extraction|remove tooth/i, 'Extraction'],
    [/check[- ]?up|consult/i, 'Dental Consultation'],
    [/tooth pain|pain|gum|bleeding/i, 'Dental Consultation'],
  ];

  for (const [pattern, label] of keywords) {
    if (pattern.test(text)) return label;
  }

  return '';
}

function extractPreferredDate(text: string): string {
  const match = text.match(
    /\b(today|tomorrow|day after tomorrow|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)(?:[a-z]*)?)\b/i,
  );

  return match?.[0]?.trim() ?? '';
}

function extractPreferredTime(text: string): string {
  const match = text.match(/\b(\d{1,2}(?::\d{2})?\s?(?:am|pm)|\d{1,2}:\d{2})\b/i);
  return match?.[1]?.trim() ?? '';
}

function extractBookingRequest(body: ChatRequestBody): ExtractedBookingRequest {
  const rawUserConversation = collectUserConversation(body);

  return {
    intent: /(book|appointment|schedule|slot|visit|consult)/i.test(rawUserConversation),
    name: extractName(rawUserConversation),
    phone: extractPhone(rawUserConversation),
    email: extractEmail(rawUserConversation),
    service: extractService(rawUserConversation, body.services ?? []),
    preferredDate: extractPreferredDate(rawUserConversation),
    preferredTime: extractPreferredTime(rawUserConversation),
    rawUserConversation,
  };
}

function getMissingBookingFields(request: ExtractedBookingRequest): string[] {
  const missing: string[] = [];

  if (!request.name) missing.push('your name');
  if (!request.phone) missing.push('your phone number');
  if (!request.service) missing.push('the treatment or dental issue');
  if (!request.preferredDate && !request.preferredTime) {
    missing.push('your preferred day or time');
  }

  return missing;
}

function buildBookingPromptReply(clinicName: string, missing: string[]): string {
  if (!missing.length) {
    return `Thanks. I have what I need to submit your booking request for ${clinicName}.`;
  }

  if (missing.length === 1) {
    return `I can book that for you. Please send ${missing[0]}.`;
  }

  const last = missing[missing.length - 1];
  const intro = missing.slice(0, -1).join(', ');
  return `I can book that for you. Please send ${intro} and ${last}.`;
}

async function createPendingChatAppointment(
  body: ChatRequestBody,
  request: ExtractedBookingRequest,
): Promise<{ bookingRef: string } | null> {
  if (!db || !body.clinicId || !body.bookingRefPrefix) return null;

  const recent = await db.collection('appointments')
    .where('clinicId', '==', body.clinicId)
    .where('phone', '==', request.phone)
    .limit(5)
    .get();

  const now = Date.now();
  const recentMatch = recent.docs.find(doc => {
    const data = doc.data();
    const createdAt = data['createdAt'];
    const createdAtMs =
      typeof createdAt?.toDate === 'function'
        ? createdAt.toDate().getTime()
        : 0;

    return data['source'] === 'chat' && createdAtMs > 0 && (now - createdAtMs) < 30 * 60 * 1000;
  });

  if (recentMatch) {
    const existingRef = recentMatch.data()['bookingRef'];
    if (typeof existingRef === 'string' && existingRef.trim()) {
      return { bookingRef: existingRef.trim() };
    }
  }

  const bookingRef = generateBookingRef(body.bookingRefPrefix);

  await db.collection('appointments').add({
    clinicId: body.clinicId,
    bookingRef,
    name: request.name,
    phone: request.phone,
    email: request.email || '',
    service: request.service,
    date: request.preferredDate,
    time: request.preferredTime,
    message: `AI chat booking request. ${request.rawUserConversation}`.trim(),
    status: 'pending',
    source: 'chat',
    createdAt: FieldValue.serverTimestamp(),
  });

  return { bookingRef };
}

function buildFallbackReply(body: ChatRequestBody, bookingRequest: ExtractedBookingRequest): string {
  const clinicName = body.clinicName?.trim() ?? 'our clinic';
  const message = body.message.trim().toLowerCase();
  const serviceList = body.services?.filter(Boolean).slice(0, 4) ?? [];
  const listedServices = serviceList.join(', ');
  const phone = body.phone?.trim() ?? '';
  const whatsappNumber = body.whatsappNumber?.trim() ?? '';
  const hours = body.hours?.filter(Boolean).slice(0, 3) ?? [];
  const hoursLine = hours.join(', ');

  if (bookingRequest.intent) {
    return buildBookingPromptReply(clinicName, getMissingBookingFields(bookingRequest));
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
  const history = body.history ?? [];
  const { message, clinicName = 'our clinic', services = [] } = body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'message is required' });
  }

  const bookingRequest = extractBookingRequest(body);
  const bookingMissing = getMissingBookingFields(bookingRequest);
  const alreadyConfirmed = hasExistingBookingConfirmation(history);

  if (bookingRequest.intent && !alreadyConfirmed) {
    if (!bookingMissing.length) {
      try {
        const created = await createPendingChatAppointment(body, bookingRequest);

        if (created) {
          const serviceText = bookingRequest.service ? ` for ${bookingRequest.service}` : '';
          const dateText = bookingRequest.preferredDate ? ` on ${bookingRequest.preferredDate}` : '';
          const timeText = bookingRequest.preferredTime ? ` at ${bookingRequest.preferredTime}` : '';
          const whatsappText = body.whatsappNumber?.trim()
            ? ' The clinic team will confirm the slot on WhatsApp or by call.'
            : ' The clinic team will confirm the slot shortly.';

          return res.status(200).json({
            reply: `Thanks ${bookingRequest.name}. I have submitted your booking request with ${clinicName}${serviceText}${dateText}${timeText}. Booking ref: ${created.bookingRef}.${whatsappText}`,
            bookingCreated: true,
            bookingRef: created.bookingRef,
          });
        }
      } catch (error) {
        console.error('[chat] Failed to create appointment from chat:', error);
      }

      return res.status(200).json({
        reply: `I have your booking details for ${clinicName}, but I could not submit the request automatically right now. Please use the Book Appointment form or WhatsApp button so the clinic can confirm your slot.`,
        bookingCreated: false,
      });
    }

    return res.status(200).json({
      reply: buildBookingPromptReply(clinicName, bookingMissing),
      bookingCreated: false,
    });
  }

  if (!apiKey) {
    return res.status(200).json({
      reply: buildFallbackReply(body, bookingRequest),
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
- If the patient wants to book, collect four things clearly: full name, phone number, treatment, and preferred day or time.
- Once you have those details, tell the patient you are submitting the request for clinic confirmation.
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
    const reply = data.content?.find(content => content.type === 'text')?.text
      ?? 'Sorry, I could not process that. Please try again.';

    return res.status(200).json({ reply });
  } catch (error) {
    console.error('[chat] Unexpected error:', error);
    return res.status(500).json({ error: 'Internal error' });
  }
}
