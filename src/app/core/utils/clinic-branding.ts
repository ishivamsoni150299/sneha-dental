const GENERIC_CLINIC_WORDS = new Set([
  'dental',
  'dentals',
  'clinic',
  'clinics',
  'care',
  'centre',
  'center',
  'hospital',
  'hospitals',
  'multispeciality',
  'multi',
  'speciality',
  'specialty',
]);

const DOCTOR_PREFIXES = /^(dr|doctor)\.?\s+/i;

function splitWords(value: string): string[] {
  return value
    .replace(/&/g, ' ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .map(word => word.trim())
    .filter(Boolean);
}

function pickMeaningfulClinicWords(name: string): string[] {
  const words = splitWords(name);
  const filtered = words.filter(word => !GENERIC_CLINIC_WORDS.has(word.toLowerCase()));
  return filtered.length ? filtered : words;
}

export function cleanDoctorName(name: string | undefined): string {
  const raw = name?.trim() ?? '';
  return raw.replace(DOCTOR_PREFIXES, '').trim();
}

export function buildClinicMonogram(name: string | undefined, fallback = 'DP'): string {
  const words = pickMeaningfulClinicWords(name?.trim() ?? '');
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return fallback.slice(0, 2).toUpperCase();
}

export function buildDoctorMonogram(
  doctorName: string | undefined,
  clinicName: string | undefined,
): string {
  const cleanedDoctor = cleanDoctorName(doctorName);
  const words = splitWords(cleanedDoctor);

  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return buildClinicMonogram(clinicName, 'DC');
}

export function buildDoctorLabel(
  doctorName: string | undefined,
  clinicName: string | undefined,
): string {
  const cleanedDoctor = cleanDoctorName(doctorName);
  if (cleanedDoctor) {
    return doctorName!.trim();
  }
  const clinic = clinicName?.trim();
  return clinic ? `${clinic} Care Team` : 'Dental Care Team';
}
