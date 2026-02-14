import { APP_CONSTANTS } from '../constants';

export const validators = {
  isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  isValidPassword(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (password.length < 8) errors.push('Password must be at least 8 characters');
    if (!/[A-Z]/.test(password)) errors.push('Password must contain an uppercase letter');
    if (!/[a-z]/.test(password)) errors.push('Password must contain a lowercase letter');
    if (!/[0-9]/.test(password)) errors.push('Password must contain a number');
    if (!/[^A-Za-z0-9]/.test(password)) errors.push('Password must contain a special character');
    return { valid: errors.length === 0, errors };
  },

  isValidProjectName(name: string): boolean {
    return name.length > 0 && name.length <= APP_CONSTANTS.MAX_PROJECT_NAME_LENGTH && /^[a-zA-Z0-9\s\-_]+$/.test(name);
  },

  isValidPrompt(prompt: string): boolean {
    return prompt.length > 0 && prompt.length <= APP_CONSTANTS.MAX_PROMPT_LENGTH;
  },

  sanitizeInput(input: string): string {
    return input.replace(/[<>]/g, '').trim();
  },
};
