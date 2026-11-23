// Errors that become a clear answer for the person using the app.
// Anything else that is thrown is a bug: it is logged and the user sees a
// generic message, never a stack trace.

export class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const badRequest = (message, extra) => new HttpError(400, 'bad_request', message, extra);
export const unauthorized = (message = 'Please sign in.') => new HttpError(401, 'unauthorized', message);
export const forbidden = (message = 'You are not allowed to do that.') => new HttpError(403, 'forbidden', message);
export const notFound = (message = 'Not found.') => new HttpError(404, 'not_found', message);
// 409: the action is valid, but the data changed or the resource is gone.
// Pass the current record so the screen can show what changed.
export const conflict = (message, extra) => new HttpError(409, 'conflict', message, extra);
// 422: the input is understood but not acceptable. fields: { name: 'reason' }
export const invalid = (fields, message = 'Please check the highlighted fields.') =>
  new HttpError(422, 'invalid', message, { fields });
export const tooMany = (message = 'Too many attempts. Please wait a few minutes.') =>
  new HttpError(429, 'too_many', message);
