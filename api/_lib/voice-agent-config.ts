export type VoiceAgentLanguage = 'hindi' | 'english' | 'bilingual';
export type OpenAIVoice = 'alloy' | 'ash' | 'ballad' | 'coral' | 'echo' | 'sage' | 'shimmer' | 'verse' | 'marin' | 'cedar';

type ClinicRecord = Record<string, unknown>;

interface ResolvedVoiceAgentSettings {
  greeting: string;
  language: VoiceAgentLanguage;
  languageCode: 'hi' | 'en';
  persona: string;
  voice: OpenAIVoice;
}

const OPENAI_VOICES = new Set<OpenAIVoice>([
  'alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse', 'marin', 'cedar',
]);

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function joinParts(parts: (string | undefined)[]): string {
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
  const formatted = slots.map(slot => {
    if (!slot || typeof slot !== 'object') return '';
    const hour = slot as ClinicRecord;
    const days = asTrimmedString(hour['days']);
    const time = asTrimmedString(hour['time']);
    return days && time ? `${days}: ${time}` : days || time;
  }).filter(Boolean);
  return formatted.length ? formatted.join(', ') : 'Please ask the clinic directly to confirm availability.';
}

function buildServicesLine(clinic: ClinicRecord): string {
  const services = Array.isArray(clinic['services']) ? clinic['services'] : [];
  const formatted = services.map(service => {
    if (!service || typeof service !== 'object') return '';
    const item = service as ClinicRecord;
    const name = asTrimmedString(item['name']);
    const price = asTrimmedString(item['price']);
    if (!name) return '';
    return price ? `${name} (${price})` : name;
  }).filter(Boolean);
  return formatted.length ? formatted.join(', ') : 'General dentistry and routine consultations.';
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => asTrimmedString(item)).filter(Boolean).slice(0, 12);
}

function getClinicKnowledge(clinic: ClinicRecord): ClinicRecord {
  const customization = clinic['customization'];
  if (!customization || typeof customization !== 'object') return {};
  const knowledge = (customization as ClinicRecord)['knowledge'];
  return knowledge && typeof knowledge === 'object' ? knowledge as ClinicRecord : {};
}

function buildKnowledgeSection(clinic: ClinicRecord): string {
  const knowledge = getClinicKnowledge(clinic);
  const rows: string[] = [];
  const treatmentFocus = asStringList(knowledge['treatmentFocus']);
  const languages = asStringList(knowledge['languages']);
  const paymentOptions = asStringList(knowledge['paymentOptions']);

  if (treatmentFocus.length) rows.push(`- Treatment focus: ${treatmentFocus.join(', ')}`);
  if (languages.length) rows.push(`- Languages spoken: ${languages.join(', ')}`);
  if (asTrimmedString(knowledge['consultationFee'])) rows.push(`- Consultation fee: ${asTrimmedString(knowledge['consultationFee'])}`);
  if (asTrimmedString(knowledge['priceGuidance'])) rows.push(`- Price guidance: ${asTrimmedString(knowledge['priceGuidance'])}`);
  if (paymentOptions.length) rows.push(`- Payment options: ${paymentOptions.join(', ')}`);
  if (asTrimmedString(knowledge['emergencyPolicy'])) rows.push(`- Emergency policy: ${asTrimmedString(knowledge['emergencyPolicy'])}`);
  if (asTrimmedString(knowledge['appointmentPolicy'])) rows.push(`- Appointment policy: ${asTrimmedString(knowledge['appointmentPolicy'])}`);
  if (asTrimmedString(knowledge['insurancePolicy'])) rows.push(`- Insurance or EMI policy: ${asTrimmedString(knowledge['insurancePolicy'])}`);
  if (asTrimmedString(knowledge['parkingInfo'])) rows.push(`- Parking: ${asTrimmedString(knowledge['parkingInfo'])}`);
  if (asTrimmedString(knowledge['accessibilityInfo'])) rows.push(`- Accessibility: ${asTrimmedString(knowledge['accessibilityInfo'])}`);
  if (asTrimmedString(knowledge['patientNotes'])) rows.push(`- Patient notes: ${asTrimmedString(knowledge['patientNotes'])}`);
  return rows.length ? `\nPATIENT KNOWLEDGE BASE:\n${rows.join('\n')}\n` : '';
}

function buildPersonaSection(persona: string): string {
  if (!persona) return '';
  const notes = persona.split(/\r?\n/).map(note => note.trim()).filter(Boolean).map(note => `- ${note}`).join('\n');
  return notes ? `\nEXTRA CLINIC NOTES:\n${notes}\n` : '';
}

export function normalizeVoiceLanguage(value: unknown): VoiceAgentLanguage {
  return value === 'english' || value === 'hindi' || value === 'bilingual' ? value : 'bilingual';
}

export function normalizeOpenAIVoice(value: unknown): OpenAIVoice {
  const voice = asTrimmedString(value) as OpenAIVoice;
  return OPENAI_VOICES.has(voice) ? voice : 'marin';
}

export function resolveVoiceAgentSettings(
  clinic: ClinicRecord,
  overrides: Partial<{
    greeting: string;
    language: VoiceAgentLanguage;
    persona: string;
    voice: OpenAIVoice;
  }> = {},
): ResolvedVoiceAgentSettings {
  const clinicName = asTrimmedString(clinic['name']) || 'Clinic';
  const language = normalizeVoiceLanguage(overrides.language ?? clinic['voiceAgentLanguage']);
  const greetingInput = overrides.greeting ?? asTrimmedString(clinic['voiceAgentGreeting']);
  return {
    greeting: asTrimmedString(greetingInput) || buildDefaultGreeting(clinicName, language),
    language,
    languageCode: language === 'english' ? 'en' : 'hi',
    persona: asTrimmedString(overrides.persona ?? clinic['voiceAgentPersona']),
    voice: normalizeOpenAIVoice(overrides.voice ?? clinic['voiceAgentVoiceId']),
  };
}

export function buildAgentSystemPrompt(
  clinic: ClinicRecord,
  overrides: Partial<{
    language: VoiceAgentLanguage;
    persona: string;
    voiceActionEnabled: boolean;
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
  const settings = resolveVoiceAgentSettings(clinic, overrides);
  const doctorLine = doctorQualification ? `${doctorName} (${doctorQualification})` : doctorName;
  const voiceActionLines = overrides.voiceActionEnabled
    ? [
        '- After the patient clearly confirms the complete booking summary, call the submit_voice_booking_request tool. Do not say the request is submitted until the tool returns success. If it returns missing_fields, ask only for the missing detail. If it returns slot_taken, ask for a different time. If it returns write_failed, ask the patient to use WhatsApp or the booking form.',
        '- When the booking action succeeds, read the booking reference exactly and say the clinic team will confirm by call or WhatsApp.',
      ].join('\n')
    : `- When all booking details are collected, confirm with: "Main aapka appointment note kar rahi hoon. ${name} ki team WhatsApp ya call par confirmation share karegi."`;

  return `You are the AI receptionist for ${name}, a dental clinic.

CLINIC FACTS:
- Clinic name: ${name}
- Doctor: ${doctorLine}
- City: ${city || 'Not specified'}
- Address: ${address}
- Clinic phone: ${clinicPhone}
- Hours: ${buildHoursLine(clinic)}
- Services and pricing: ${buildServicesLine(clinic)}
${buildKnowledgeSection(clinic)}
${buildPersonaSection(settings.persona)}
STRICT BOUNDARIES:
- Only discuss ${name}, its team, services, timings, booking flow, pricing shared above, and how to contact the clinic.
- Do not give medical advice, diagnosis, prescriptions, or treatment recommendations.
- Do not invent prices, timings, doctors, addresses, or services that are not listed here.
- If the patient asks something outside this clinic's scope, briefly explain in the patient's language that you can only help with ${name}, then offer to book an appointment.
- If clinic information is missing, say it can be confirmed during the appointment or directly with the clinic.

URGENT SAFETY:
- If the patient reports trouble breathing or swallowing, uncontrolled bleeding, loss of consciousness, major facial trauma, or rapidly worsening facial swelling, tell them to contact local emergency services or go to the nearest emergency department now. Do not diagnose, reassure, or present a routine booking as a substitute for urgent care.

${buildLanguageGuide(settings.language)}

BOOKING FLOW:
- Help the patient book or request an appointment.
- Collect one missing detail at a time: full name, phone number, treatment or issue, preferred date, then preferred time. Do not ask again for details already provided.
- Only use clear audio. If any name, phone digit, date, or time is unclear, ask the patient to repeat that detail instead of guessing.
- Read the phone number back digit by digit and wait for the patient to confirm or correct it.
- Before submitting, explain that these details will be saved and shared with ${name} so its team can follow up about the appointment.
- Summarize the name, treatment or issue, preferred date and time, and phone number. Ask for permission to submit and wait for a clear yes.
- If the patient corrects any detail, read back the complete corrected summary and ask for confirmation again.
${voiceActionLines}

REPLY STYLE:
- Keep every reply concise, warm, and professional.
- Maximum 2 sentences per reply.
- Ask only one question per reply.
- Vary acknowledgements so the conversation does not sound repetitive.
- Focus on the next useful action: book, call, or WhatsApp the clinic.
- If asked about price, share only the listed price or say the exact quote is confirmed at consultation.`;
}