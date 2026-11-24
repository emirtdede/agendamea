import type { LanguageCode } from './languages';
import * as loc_af from './locales/af';
import * as loc_am from './locales/am';
import * as loc_ar from './locales/ar';
import * as loc_az from './locales/az';
import * as loc_bg from './locales/bg';
import * as loc_bn from './locales/bn';
import * as loc_bs from './locales/bs';
import * as loc_ca from './locales/ca';
import * as loc_cs from './locales/cs';
import * as loc_cy from './locales/cy';
import * as loc_da from './locales/da';
import * as loc_de from './locales/de';
import * as loc_el from './locales/el';
import * as loc_es from './locales/es';
import * as loc_et from './locales/et';
import * as loc_eu from './locales/eu';
import * as loc_fa from './locales/fa';
import * as loc_fi from './locales/fi';
import * as loc_fr from './locales/fr';
import * as loc_gl from './locales/gl';
import * as loc_gu from './locales/gu';
import * as loc_he from './locales/he';
import * as loc_hi from './locales/hi';
import * as loc_hr from './locales/hr';
import * as loc_hu from './locales/hu';
import * as loc_hy from './locales/hy';
import * as loc_id from './locales/id';
import * as loc_is from './locales/is';
import * as loc_it from './locales/it';
import * as loc_ja from './locales/ja';
import * as loc_ka from './locales/ka';
import * as loc_kk from './locales/kk';
import * as loc_km from './locales/km';
import * as loc_kn from './locales/kn';
import * as loc_ko from './locales/ko';
import * as loc_ky from './locales/ky';
import * as loc_lo from './locales/lo';
import * as loc_lt from './locales/lt';
import * as loc_lv from './locales/lv';
import * as loc_mk from './locales/mk';
import * as loc_ml from './locales/ml';
import * as loc_mr from './locales/mr';
import * as loc_ms from './locales/ms';
import * as loc_my from './locales/my';
import * as loc_ne from './locales/ne';
import * as loc_nl from './locales/nl';
import * as loc_no from './locales/no';
import * as loc_pa from './locales/pa';
import * as loc_pl from './locales/pl';
import * as loc_pt from './locales/pt';
import * as loc_pt_BR from './locales/pt-BR';
import * as loc_ro from './locales/ro';
import * as loc_ru from './locales/ru';
import * as loc_si from './locales/si';
import * as loc_sk from './locales/sk';
import * as loc_sl from './locales/sl';
import * as loc_sq from './locales/sq';
import * as loc_sr from './locales/sr';
import * as loc_sv from './locales/sv';
import * as loc_sw from './locales/sw';
import * as loc_ta from './locales/ta';
import * as loc_te from './locales/te';
import * as loc_th from './locales/th';
import * as loc_tk from './locales/tk';
import * as loc_tl from './locales/tl';
import * as loc_uk from './locales/uk';
import * as loc_ur from './locales/ur';
import * as loc_uz from './locales/uz';
import * as loc_vi from './locales/vi';
import * as loc_zh_CN from './locales/zh-CN';
import * as loc_zh_TW from './locales/zh-TW';
import {
  EN_DICTIONARY,
  EN_LEGAL_DOCUMENTS,
  type LegalDocId,
  type LegalDocumentContent,
  TR_DICTIONARY,
  TR_LEGAL_DOCUMENTS,
  type UiDictionary,
} from './translations';

interface LocaleBundle {
  readonly dict: UiDictionary;
  readonly legal: Record<LegalDocId, LegalDocumentContent>;
}

const WORLD_LOCALES: Record<Exclude<LanguageCode, 'tr' | 'en'>, LocaleBundle> = {
  de: loc_de,
  fr: loc_fr,
  es: loc_es,
  it: loc_it,
  pt: loc_pt,
  'pt-BR': loc_pt_BR,
  ru: loc_ru,
  ja: loc_ja,
  ko: loc_ko,
  'zh-CN': loc_zh_CN,
  'zh-TW': loc_zh_TW,
  ar: loc_ar,
  hi: loc_hi,
  bn: loc_bn,
  pa: loc_pa,
  ur: loc_ur,
  fa: loc_fa,
  he: loc_he,
  nl: loc_nl,
  pl: loc_pl,
  uk: loc_uk,
  cs: loc_cs,
  sk: loc_sk,
  hu: loc_hu,
  ro: loc_ro,
  bg: loc_bg,
  el: loc_el,
  sv: loc_sv,
  da: loc_da,
  no: loc_no,
  fi: loc_fi,
  is: loc_is,
  et: loc_et,
  lv: loc_lv,
  lt: loc_lt,
  hr: loc_hr,
  sr: loc_sr,
  sl: loc_sl,
  bs: loc_bs,
  mk: loc_mk,
  sq: loc_sq,
  az: loc_az,
  kk: loc_kk,
  uz: loc_uz,
  ky: loc_ky,
  tk: loc_tk,
  ka: loc_ka,
  hy: loc_hy,
  id: loc_id,
  ms: loc_ms,
  vi: loc_vi,
  th: loc_th,
  tl: loc_tl,
  km: loc_km,
  lo: loc_lo,
  my: loc_my,
  ta: loc_ta,
  te: loc_te,
  mr: loc_mr,
  gu: loc_gu,
  kn: loc_kn,
  ml: loc_ml,
  si: loc_si,
  ne: loc_ne,
  sw: loc_sw,
  am: loc_am,
  af: loc_af,
  ca: loc_ca,
  eu: loc_eu,
  gl: loc_gl,
  cy: loc_cy,
};

export function getDictionary(lang: LanguageCode): UiDictionary {
  if (lang === 'tr') return TR_DICTIONARY;
  if (lang === 'en') return EN_DICTIONARY;
  return WORLD_LOCALES[lang]?.dict ?? EN_DICTIONARY;
}

export function getLegalDocumentsForLanguage(
  lang: LanguageCode,
  _dict?: UiDictionary,
): Record<LegalDocId, LegalDocumentContent> {
  if (lang === 'tr') return TR_LEGAL_DOCUMENTS;
  if (lang === 'en') return EN_LEGAL_DOCUMENTS;
  return WORLD_LOCALES[lang]?.legal ?? EN_LEGAL_DOCUMENTS;
}

export const getLegalDocuments = getLegalDocumentsForLanguage;
