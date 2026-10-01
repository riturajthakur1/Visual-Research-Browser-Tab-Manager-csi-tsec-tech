// Language detection for goals, questions and pages. Script ranges identify
// most languages outright; Latin and Devanagari scripts are split by counting
// very common function words.

export interface LanguageInfo {
  /** BCP-47-ish code, e.g. "en", "hi", "mr", "ar". */
  code: string;
  /** English name, used when instructing the model. */
  name: string;
  rtl: boolean;
}

const NAMES: Record<string, string> = {
  en: 'English', hi: 'Hindi', mr: 'Marathi', ne: 'Nepali', bn: 'Bengali', pa: 'Punjabi', gu: 'Gujarati', ta: 'Tamil',
  te: 'Telugu', kn: 'Kannada', ml: 'Malayalam', or: 'Odia', ur: 'Urdu', ar: 'Arabic', fa: 'Persian', he: 'Hebrew',
  ru: 'Russian', uk: 'Ukrainian', el: 'Greek', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', th: 'Thai', es: 'Spanish',
  fr: 'French', de: 'German', pt: 'Portuguese', it: 'Italian', nl: 'Dutch', id: 'Indonesian', tr: 'Turkish',
  vi: 'Vietnamese', sw: 'Swahili', pl: 'Polish', si: 'Sinhala', my: 'Burmese', km: 'Khmer', am: 'Amharic',
};

const RTL = new Set(['ar', 'ur', 'fa', 'he']);

const SCRIPTS: [RegExp, string][] = [
  [/[ঀ-৿]/g, 'bn'],
  [/[਀-੿]/g, 'pa'],
  [/[઀-૿]/g, 'gu'],
  [/[଀-୿]/g, 'or'],
  [/[஀-௿]/g, 'ta'],
  [/[ఀ-౿]/g, 'te'],
  [/[ಀ-೿]/g, 'kn'],
  [/[ഀ-ൿ]/g, 'ml'],
  [/[඀-෿]/g, 'si'],
  [/[฀-๿]/g, 'th'],
  [/[က-႟]/g, 'my'],
  [/[ក-៿]/g, 'km'],
  [/[ሀ-፿]/g, 'am'],
  [/[֐-׿]/g, 'he'],
  [/[Ͱ-Ͽ]/g, 'el'],
  [/[぀-ヿ]/g, 'ja'],
  [/[가-힯ᄀ-ᇿ]/g, 'ko'],
];

const FUNCTION_WORDS: Record<string, string[]> = {
  en: ['the', 'and', 'of', 'to', 'is', 'in', 'what', 'why', 'how', 'does', 'for', 'are', 'it', 'with'],
  es: ['el', 'la', 'de', 'que', 'y', 'en', 'los', 'por', 'qué', 'cómo', 'es', 'las', 'para', 'del', 'una'],
  fr: ['le', 'la', 'les', 'de', 'et', 'des', 'est', 'pourquoi', 'comment', 'en', 'du', 'que', 'une', 'pour', 'dans'],
  de: ['der', 'die', 'das', 'und', 'ist', 'warum', 'wie', 'nicht', 'mit', 'ein', 'eine', 'den', 'für', 'auf', 'was'],
  pt: ['o', 'a', 'os', 'de', 'e', 'que', 'por', 'porque', 'como', 'é', 'do', 'da', 'em', 'uma', 'não', 'são'],
  it: ['il', 'la', 'di', 'che', 'e', 'perché', 'come', 'è', 'del', 'della', 'per', 'una', 'gli', 'sono'],
  nl: ['de', 'het', 'een', 'en', 'van', 'waarom', 'hoe', 'is', 'niet', 'op', 'voor', 'zijn', 'wat'],
  id: ['yang', 'dan', 'di', 'ini', 'itu', 'mengapa', 'bagaimana', 'apa', 'untuk', 'dengan', 'tidak', 'adalah'],
  tr: ['ve', 'bir', 'bu', 'neden', 'nasıl', 'ne', 'için', 'ile', 'mi', 'da', 'de', 'olan'],
  vi: ['và', 'của', 'là', 'tại', 'sao', 'như', 'thế', 'nào', 'không', 'các', 'những', 'được'],
  pl: ['i', 'w', 'nie', 'jest', 'dlaczego', 'jak', 'co', 'na', 'się', 'to', 'z', 'czy'],
  sw: ['na', 'ya', 'wa', 'kwa', 'ni', 'kwa nini', 'jinsi', 'katika', 'za', 'hii'],
  hi: ['है', 'और', 'के', 'में', 'की', 'का', 'क्यों', 'कैसे', 'क्या', 'हैं', 'से', 'को', 'नहीं', 'यह', 'था'],
  mr: ['आहे', 'आणि', 'च्या', 'मध्ये', 'का', 'कसे', 'काय', 'आहेत', 'ला', 'ची', 'चा', 'नाही', 'हे', 'होते'],
  ne: ['छ', 'र', 'को', 'मा', 'किन', 'कसरी', 'के', 'हो', 'छन्', 'लाई', 'गर्न'],
  ar: ['في', 'من', 'على', 'إلى', 'لماذا', 'كيف', 'ما', 'هو', 'التي', 'الذي', 'هذا', 'أن'],
  ur: ['ہے', 'اور', 'کے', 'میں', 'کی', 'کا', 'کیوں', 'کیسے', 'کیا', 'ہیں', 'سے', 'کو'],
  fa: ['است', 'و', 'در', 'به', 'از', 'چرا', 'چگونه', 'چه', 'این', 'که', 'را', 'با'],
  ru: ['и', 'в', 'не', 'на', 'что', 'почему', 'как', 'это', 'с', 'по', 'для', 'из'],
  uk: ['і', 'в', 'не', 'на', 'що', 'чому', 'як', 'це', 'з', 'та', 'для', 'від'],
};

function count(text: string, re: RegExp): number {
  return text.match(re)?.length ?? 0;
}

function bestByWords(text: string, candidates: string[]): string | undefined {
  const tokens = text.toLowerCase().split(/[\s,.;:!?¿¡()"'«»“”—–-]+/u).filter(Boolean);
  if (!tokens.length) return undefined;
  const set = new Map<string, number>();
  for (const t of tokens) set.set(t, (set.get(t) ?? 0) + 1);
  let best: string | undefined;
  let bestScore = 0;
  for (const code of candidates) {
    const score = FUNCTION_WORDS[code].reduce((s, w) => s + (set.get(w) ?? 0), 0);
    if (score > bestScore) {
      best = code;
      bestScore = score;
    }
  }
  return best;
}

export function detectLanguage(text: string): LanguageInfo {
  const sample = text.slice(0, 2000);
  const make = (code: string): LanguageInfo => ({ code, name: NAMES[code] ?? code, rtl: RTL.has(code) });
  const letters = count(sample, /\p{L}/gu) || 1;

  const han = count(sample, /\p{Script=Han}/gu);
  const kana = count(sample, /[぀-ヿ]/g);
  if (kana / letters > 0.05) return make('ja');
  if (han / letters > 0.3) return make('zh');

  for (const [re, code] of SCRIPTS) if (count(sample, re) / letters > 0.3) return make(code);

  if (count(sample, /[ऀ-ॿ]/g) / letters > 0.3) return make(bestByWords(sample, ['hi', 'mr', 'ne']) ?? 'hi');
  if (count(sample, /[؀-ۿݐ-ݿ]/g) / letters > 0.3) {
    if (/[ٹڈڑںےۓ]/.test(sample)) return make('ur');
    return make(bestByWords(sample, ['ar', 'fa', 'ur']) ?? 'ar');
  }
  if (count(sample, /[Ѐ-ӿ]/g) / letters > 0.3) return make(/[іїєґ]/i.test(sample) ? 'uk' : 'ru');

  const latin = ['en', 'es', 'fr', 'de', 'pt', 'it', 'nl', 'id', 'tr', 'vi', 'pl', 'sw'];
  return make(bestByWords(sample, latin) ?? 'en');
}

/** Instruction appended to prompts so answers come back in the user's language. */
export function languageInstruction(lang: LanguageInfo): string {
  return lang.code === 'en'
    ? 'Write all text in English.'
    : `Write all text in ${lang.name}, the language the user wrote in (keep technical terms and proper nouns as they are).`;
}
