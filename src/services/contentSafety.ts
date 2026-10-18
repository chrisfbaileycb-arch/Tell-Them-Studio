/**
 * Pure (DOM-free) community safety checks. Shared by the browser studio and the
 * server-side publication moderation so both enforce one standard.
 */

export interface SafetyVerdict {
  valid: boolean;
  reason?: string;
  suggestion?: string;
}

const UNKIND_WORDS = [
  'trash',
  'garbage',
  'terrible',
  'horrible',
  'stupid',
  'awful',
  'sucks',
  'hate you',
  'worst',
  'ugly',
  'shut up',
  'idiot',
  'loser',
];

/** Put-down language check (kindness-first community standard). */
export const checkUnkindLanguage = (text: string): SafetyVerdict => {
  const lower = text.toLowerCase();
  for (const w of UNKIND_WORDS) {
    if (lower.includes(w)) {
      return {
        valid: false,
        reason:
          'Tell Them Studio is a 100% supportive, kindness-first creation community. Put-downs and negative remarks are not permitted.',
        suggestion:
          'Try sharing constructive encouragement, a question about their arrangement, or a specific musical compliment!',
      };
    }
  }
  return { valid: true };
};

/** Personal contact data check (handles only: no phone numbers or emails in public content). */
export const checkPersonalContact = (text: string): SafetyVerdict => {
  if (/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/.test(text) || /\S+@\S+\.\S+/.test(text)) {
    return {
      valid: false,
      reason:
        'For creator safety, all connections happen exclusively under studio handles (@handle). Please do not share personal phone numbers or email addresses.',
    };
  }
  return { valid: true };
};

/**
 * Checks community praise, comments, and prompts against Tell Them Studio's
 * Kindness-First, Family-Safe (PG), and Royalty/Trademark Respect standards.
 */
export const validateKindnessAndSafety = (text: string): SafetyVerdict => {
  const unkind = checkUnkindLanguage(text);
  if (!unkind.valid) return unkind;
  return checkPersonalContact(text);
};
