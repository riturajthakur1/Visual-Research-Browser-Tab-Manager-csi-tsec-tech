import { describe, expect, it } from 'vitest';
import { detectLanguage } from '../../src/core/lang';

const cases: [string, string][] = [
  ['Why does Mumbai flood every monsoon, and what would fix it?', 'en'],
  ['मुंबई में हर मानसून में बाढ़ क्यों आती है?', 'hi'],
  ['मुंबईत दर पावसाळ्यात पूर का येतो आणि त्यावर उपाय काय आहे?', 'mr'],
  ['¿Por qué se inunda Mumbai cada monzón y cómo se puede solucionar?', 'es'],
  ['Pourquoi Mumbai est-elle inondée à chaque mousson et comment y remédier ?', 'fr'],
  ['Warum wird Mumbai bei jedem Monsun überflutet und was hilft dagegen?', 'de'],
  ['Por que Mumbai inunda em todas as monções e como resolver isso?', 'pt'],
  ['لماذا تغرق مومباي في كل موسم أمطار؟', 'ar'],
  ['ممبئی میں ہر مون سون میں سیلاب کیوں آتا ہے؟', 'ur'],
  ['为什么孟买每个季风季节都会发生洪水？', 'zh'],
  ['なぜムンバイは毎年モンスーンで洪水になるのですか？', 'ja'],
  ['뭄바이는 왜 매년 장마철에 홍수가 나나요?', 'ko'],
  ['மும்பையில் ஒவ்வொரு பருவமழையிலும் ஏன் வெள்ளம் ஏற்படுகிறது?', 'ta'],
  ['প্রতি বর্ষায় মুম্বাইয়ে কেন বন্যা হয়?', 'bn'],
  ['Почему Мумбаи затапливает каждый муссон?', 'ru'],
];

describe('detectLanguage', () => {
  it.each(cases)('%s → %s', (text, code) => {
    expect(detectLanguage(text).code).toBe(code);
  });

  it('marks right-to-left scripts', () => {
    expect(detectLanguage('لماذا تغرق مومباي').rtl).toBe(true);
    expect(detectLanguage('Why does it flood').rtl).toBe(false);
  });
});
