import path from 'path';

/**
 * Sanitize user input to prevent XSS.
 * Strips HTML tags and dangerous characters.
 */
export function sanitizeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Validate and sanitize a file path to prevent directory traversal attacks.
 * Ensures the resolved path stays within the allowed base directory.
 *
 * @throws Error if the path attempts to escape the base directory.
 */
export function safePath(basePath: string, userPath: string): string {
  // Normalize to resolve ../ and ./ segments
  const normalized = path.normalize(userPath);

  // Reject absolute paths and paths starting with ../
  if (path.isAbsolute(normalized)) {
    throw new Error(`Invalid path: absolute paths not allowed: ${userPath}`);
  }

  const resolved = path.resolve(basePath, normalized);
  const resolvedBase = path.resolve(basePath);

  // Ensure the resolved path is still within the base directory
  if (!resolved.startsWith(resolvedBase + path.sep) && resolved !== resolvedBase) {
    throw new Error(`Path traversal detected: ${userPath} escapes ${basePath}`);
  }

  return resolved;
}

/**
 * Sanitize a string for safe use in shell commands.
 * Only allows alphanumeric, hyphens, underscores, and dots.
 */
export function sanitizeForShell(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]/g, '');
}
