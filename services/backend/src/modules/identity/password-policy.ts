const COMMON = new Set([
  'password', 'password1', '12345678', '123456789', '1234567890', 'qwertyui', 'qwerty123', 'iloveyou', 'abcd1234',
  '11111111', '00000000', 'bangladesh', 'admin123', 'letmein1', 'welcome1', 'passw0rd', '987654321', 'abc12345',
]);

export type PasswordProblem = 'TOO_SHORT' | 'TOO_LONG' | 'COMMON' | 'SAME_AS_PHONE';

export function checkPassword(password: string, phoneE164: string, staff = false): PasswordProblem[] {
  const problems: PasswordProblem[] = [];
  const length = [...password].length;
  if (length < (staff ? 10 : 8)) problems.push('TOO_SHORT');
  if (length > 64) problems.push('TOO_LONG');
  if (COMMON.has(password.toLowerCase())) problems.push('COMMON');
  const local = phoneE164.replace(/^\+880/, '0');
  if (password === phoneE164 || password === local || password === phoneE164.slice(1)) problems.push('SAME_AS_PHONE');
  return problems;
}
