/**
 * Centralized Error Handler and Types
 * Standardizes error responses across all endpoints
 */

import { HTTP_STATUS, ERROR_CODES } from './constants.js';

/**
 * Custom AppError class for consistent error handling
 */
export class AppError extends Error {
  constructor(
    message,
    statusCode = HTTP_STATUS.INTERNAL_ERROR,
    code = ERROR_CODES.INTERNAL_ERROR,
    context = {}
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.context = context;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * Validation error for schema validation failures
 */
export class ValidationError extends AppError {
  constructor(message, errors = []) {
    super(message, HTTP_STATUS.UNPROCESSABLE, ERROR_CODES.VALIDATION_FAILED);
    this.errors = errors;
  }
}

/**
 * Not found error
 */
export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', resource = 'resource') {
    super(message, HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND, { resource });
  }
}

/**
 * Unauthorized error
 */
export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
  }
}

/**
 * Forbidden error
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN);
  }
}

/**
 * Standard API response wrapper
 */
export class ApiResponse {
  constructor(success, data = null, error = null, meta = null) {
    this.success = success;
    if (data) this.data = data;
    if (error) this.error = error;
    if (meta) this.meta = meta;
  }

  static ok(data, meta = null) {
    return new ApiResponse(true, data, null, meta);
  }

  static error(error, statusCode = HTTP_STATUS.INTERNAL_ERROR) {
    const response = new ApiResponse(false, null, error);
    response.statusCode = statusCode;
    return response;
  }
}

/**
 * Fastify error handler plugin
 * Registers with app.setErrorHandler()
 */
export async function registerErrorHandler(app) {
  app.setErrorHandler((error, request, reply) => {
    // Log error with context
    app.log.error({
      error: error.message,
      code: error.code || 'UNKNOWN',
      statusCode: error.statusCode || HTTP_STATUS.INTERNAL_ERROR,
      context: error.context,
      stack: error.stack,
      url: request.url,
      method: request.method,
    });

    // Handle AppError (our custom errors)
    if (error instanceof AppError) {
      const response = new ApiResponse(
        false,
        null,
        error.message
      );
      
      if (error.errors) {
        response.errors = error.errors; // Validation errors
      }
      
      return reply.status(error.statusCode).send(response);
    }

    // Handle Zod validation errors
    if (error.message?.includes('Zod')) {
      const response = new ApiResponse(
        false,
        null,
        'Validation failed'
      );
      response.errors = error.issues || [];
      
      return reply
        .status(HTTP_STATUS.UNPROCESSABLE)
        .send(response);
    }

    // Handle Prisma errors
    if (error.code === 'P2002') {
      // Unique constraint violation
      const field = error.meta?.target?.[0] || 'field';
      return reply
        .status(HTTP_STATUS.CONFLICT)
        .send(
          new ApiResponse(
            false,
            null,
            `${field} already exists`
          )
        );
    }

    if (error.code === 'P2025') {
      // Record not found
      return reply
        .status(HTTP_STATUS.NOT_FOUND)
        .send(
          new ApiResponse(false, null, 'Resource not found')
        );
    }

    // Handle JWT errors
    if (error.name === 'UnauthorizedError' || error.message?.includes('JWT')) {
      return reply
        .status(HTTP_STATUS.UNAUTHORIZED)
        .send(
          new ApiResponse(false, null, 'Invalid or expired token')
        );
    }

    // Handle CSRF errors
    if (error.message?.includes('CSRF')) {
      return reply
        .status(HTTP_STATUS.FORBIDDEN)
        .send(
          new ApiResponse(false, null, 'CSRF validation failed')
        );
    }

    // Generic error response (never expose internal details in production)
    const isDev = process.env.NODE_ENV === 'development';
    const message = isDev ? error.message : 'Internal server error';
    
    return reply
      .status(HTTP_STATUS.INTERNAL_ERROR)
      .send(
        new ApiResponse(false, null, message)
      );
  });
}

/**
 * Wrapper for async route handlers
 * Catches errors and passes to error handler
 */
export function asyncHandler(fn) {
  return (app) => {
    return async (request, reply) => {
      try {
        return await fn(request, reply);
      } catch (err) {
        throw err; // Let error handler deal with it
      }
    };
  };
}
