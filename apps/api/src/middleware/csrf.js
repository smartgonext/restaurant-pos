/**
 * CSRF Protection Middleware
 * Implements double-submit cookie pattern for CSRF protection
 */

import crypto from 'crypto';

const CSRF_TOKEN_LENGTH = 32;
const CSRF_TOKEN_COOKIE_NAME = 'XSRF-TOKEN';
const CSRF_TOKEN_HEADER_NAME = 'X-XSRF-TOKEN';
const CSRF_TOKEN_BODY_NAME = '_csrf';

/**
 * Generate a new CSRF token
 */
function generateCsrfToken() {
  return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
}

/**
 * CSRF token middleware for Fastify
 * Validates CSRF tokens on state-changing requests
 */
export async function csrfProtection(app) {
  // Skip CSRF check for these endpoints
  const skipCsrfEndpoints = [
    '/api/auth/login',
    '/api/auth/superadmin/login',
    '/api/auth/logout',
    '/api/auth/refresh',
    '/api/health',
    '/health',
    '/seed',
  ];

  app.addHook('onRequest', async (request, reply) => {
    // Generate CSRF token on GET requests
    if (request.method === 'GET') {
      const token = generateCsrfToken();
      // Store in cookie (httpOnly: false so JS can read it)
      reply.header('Set-Cookie', [
        `${CSRF_TOKEN_COOKIE_NAME}=${token}; Path=/; SameSite=Strict; Max-Age=3600`,
      ]);
      // Also add to request for template use
      request.csrfToken = token;
      return;
    }

    // Skip CSRF validation for whitelisted endpoints
    if (skipCsrfEndpoints.some((path) => request.url.includes(path))) {
      return;
    }

    // Validate CSRF token on state-changing requests (POST, PUT, DELETE, PATCH)
    const stateMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
    if (stateMethods.includes(request.method)) {
      const tokenFromCookie = getCsrfTokenFromCookie(request);
      const tokenFromHeader = request.headers[CSRF_TOKEN_HEADER_NAME.toLowerCase()];
      const tokenFromBody = request.body?.[CSRF_TOKEN_BODY_NAME];

      const providedToken = tokenFromHeader || tokenFromBody;

      if (!tokenFromCookie || !providedToken) {
        return reply.status(403).send({
          success: false,
          error: 'CSRF token missing',
        });
      }

      if (tokenFromCookie !== providedToken) {
        return reply.status(403).send({
          success: false,
          error: 'CSRF token invalid',
        });
      }

      // Token is valid, generate new one for next request
      const newToken = generateCsrfToken();
      reply.header('Set-Cookie', [
        `${CSRF_TOKEN_COOKIE_NAME}=${newToken}; Path=/; SameSite=Strict; Max-Age=3600`,
      ]);
    }
  });
}

/**
 * Extract CSRF token from cookies
 */
function getCsrfTokenFromCookie(request) {
  const cookieHeader = request.headers.cookie || '';
  const cookies = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .reduce((acc, c) => {
      const [key, val] = c.split('=');
      acc[key] = decodeURIComponent(val || '');
      return acc;
    }, {});
  return cookies[CSRF_TOKEN_COOKIE_NAME];
}

/**
 * Helper to add CSRF token to forms/AJAX requests in frontend
 * Usage: In components, get token from:
 * - Cookie: document.cookie.split('; ').find(row => row.startsWith('XSRF-TOKEN=')).split('=')[1]
 * - Or from response header
 * Then include in:
 * - Form: <input type="hidden" name="_csrf" value={token} />
 * - AJAX: headers: { 'X-XSRF-TOKEN': token }
 */
export function getCsrfTokenFromResponse(response) {
  const setCookie = response.headers.get('Set-Cookie') || '';
  const match = setCookie.match(/XSRF-TOKEN=([^;]+)/);
  return match ? match[1] : null;
}

export { CSRF_TOKEN_HEADER_NAME, CSRF_TOKEN_BODY_NAME };
