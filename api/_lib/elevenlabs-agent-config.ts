export type VoiceAgentLanguage = 'hindi' | 'english' | 'bilingual';

type ClinicRecord = Record<string, unknown>;

interface ResolvedVoiceAgentSettings {
  greeting: string;
  language: VoiceAgentLanguage;
  languageCode: 'hi' | 'en';
  persona: string;
  voiceId: string;
}

const DEFAULT_VOICE_ID = '9BWtsMINqrJLrRacOk9x';

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function joinParts(parts: Array<string | undefined>): string {
  return parts.map(part => (part ?? '').trim()).filter(Boolean).join(', ');
}

function buildDefaultGreeting(clinicName: string, language: VoiceAgentLanguage): string {
  if (language === 'english') {
    return `Hello and welcome to ${clinicName}. How can I help you today?`;
  }

  if (language === 'hindi') {
    return `Namaste! ${clinicName} mein aapka swagat hai. Main aapki kaise madad kar sakti hoon?`;
  }

  return `Namaste! Welcome to ${clinicName}. Main Hindi ya English mein aapki madad kar sakti hoon.`;
}

function buildLanguageGuide(language: VoiceAgentLanguage): string {
  if (language === 'english') {
    return 'LANGUAGE: Start in English. Stay in clear, simple English unless the patient explicitly switches.';
  }

  if (language === 'hindi') {
    return 'LANGUAGE: Start in Hindi. Switch to English only if the patient clearly prefers English. Hinglish is acceptable.';
  }

  return 'LANGUAGE: Start in warm Hindi or Hinglish. Continue in the patient\'s preferred language and switch naturally between Hindi and English when needed.';
}

function buildHoursLine(clinic: ClinicRecord): string {
  const slots = Array.isArray(clinic['hours']) ? clinic['hours'] : [];
  const formatted = slots
    .map(slot => {
      if (!slot || typeof slot !== 'object') return '';
      const hour = slot as Record<string, unknown>;
      const days = asTrimmedString(hour['days']);
      const time = asTrimmedString(hour['time']);
      if (days && time) return `${days}: ${time}`;
      return days || time;
    })
    .filter(Boolean);

  return formatted.length > 0 ? formatted.join(', ') : 'Please ask the clinic directly to confirm availability.';
}

function buildServicesLine(clinic: ClinicRecord): string {
  const services = Array.isArray(clinic['services']) ? clinic['services'] : [];
  const formatted = services
    .map(service => {
      if (!service || typeof service !== 'object') return '';
      const item = service as Record<string, unknown>;
      const name = asTrimmedString(item['name']);
      const price = asTrimmedString(item['price']);
      if (!name) return '';
      return price ? `${name} (${price})` : name;
    })
    .filter(Boolean);

  return formatted.length > 0 ? formatted.join(', ') : 'General dentistry and routine consultations.';
}

function buildPersonaSection(persona: string): string {
  if (!persona) return '';

  const notes = persona
    .split(/\r?\n/)
    .map(note => note.trim())
    .filter(Boolean)
    .map(note => `- ${note}`)
    .join('\n');

  return notes ? `\nEXTRA CLINIC NOTES:\n${notes}\n` : '';
}

export function normalizeVoiceLanguage(value: unknown): VoiceAgentLanguage {
  if (value === 'english' || value === 'hindi' || value === 'bilingual') {
    return value;
  }

  return 'bilingual';
}

export function sanitizeWhatsappPhoneNumberId(value: unknown): string {
  return asTrimmedString(value);
}

export function resolveVoiceAgentSettings(
  clinic: ClinicRecord,
  overrides: Partial<{
    greeting: string;
    language: VoiceAgentLanguage;
    persona: string;
    voiceId: string;
  }> = {},
): ResolvedVoiceAgentSettings {
  const clinicName = asTrimmedString(clinic['name']) || 'Clinic';
  const language = normalizeVoiceLanguage(overrides.language ?? clinic['voiceAgentLanguage']);
  const greetingInput = overrides.greeting ?? asTrimmedString(clinic['voiceAgentGreeting']);
  const persona = asTrimmedString(overrides.persona ?? clinic['voiceAgentPersona']);
  const voiceId = asTrimmedString(overrides.voiceId ?? clinic['voiceAgentVoiceId']) || DEFAULT_VOICE_ID;

  return {
    greeting: asTrimmedString(greetingInput) || buildDefaultGreeting(clinicName, language),
    language,
    languageCode: language === 'english' ? 'en' : 'hi',
    persona,
    voiceId,
  };
}

export function buildAgentSystemPrompt(
  clinic: ClinicRecord,
  overrides: Partial<{
    language: VoiceAgentLanguage;
    persona: string;
  }> = {},
): string {
  const name = asTrimmedString(clinic['name']) || 'this clinic';
  const doctorName = asTrimmedString(clinic['doctorName']) || 'the clinic doctor';
  const doctorQualification = asTrimmedString(clinic['doctorQualification']);
  const clinicPhone = asTrimmedString(clinic['phone']) || asTrimmedString(clinic['whatsappNumber']) || 'the clinic phone number';
  const city = asTrimmedString(clinic['city']);
  const address = joinParts([
    asTrimmedString(clinic['addressLine1']),
    asTrimmedString(clinic['addressLine2']),
    city,
  ]) || 'the clinic address';
  const hours = buildHoursLine(clinic);
  const services = buildServicesLine(clinic);
  const settings = resolveVoiceAgentSettings(clinic, overrides);
  const personaSection = buildPersonaSection(settings.persona);
  const doctorLine = doctorQualification ? `${doctorName} (${doctorQualification})` : doctorName;

  return `You are the AI receptionist for ${name}, a dental clinic.

CLINIC FACTS:
- Clinic name: ${name}
- Doctor: ${doctorLine}
- City: ${city || 'Not specified'}
- Address: ${address}
- Clinic phone: ${clinicPhone}
- Hours: ${hours}
- Services and pricing: ${services}
${personaSection}
STRICT BOUNDARIES:
- Only discuss ${name}, its team, services, timings, booking flow, pricing shared above, and how to contact the clinic.
- Do not give medical advice, diagnosis, prescriptions, or treatment recommendations.
- Do not invent prices, timings, doctors, addresses, or services that are not listed here.
- If the patient asks something outside this clinic's scope, say: "Mujhe sirf ${name} ke baare mein jaankari hai. Kya main aapka appointment book kar sakti hoon?"
- If information is missing, say: "Iske baare mein hum appointment pe baat kar sakte hain."

${buildLanguageGuide(settings.language)}

BOOKING FLOW:
- Help the patient book or request an appointment.
- Before confirming a booking request, collect all four details: full name, phone number, preferred date and time, and the treatment or issue.
- When all booking details are collected, confirm with: "Main aapka appointment note kar rahi hoon. ${name} ki team WhatsApp ya call par confirmation share karegi."

REPLY STYLE:
- Keep every reply concise, warm, and professional.
- Maximum 2 sentences per reply.
- Focus on the next useful action: book, call, or WhatsApp the clinic.
- If asked about price, share only the listed price or say the exact quote is confirmed at consultation.`;
}
