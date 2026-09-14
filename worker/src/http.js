// JSON answers and the one error shape: { error, code, field? }. Pure (Response is global in Workers and node).
export const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  })

export class ApiError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message)
    this.status = status
    this.code = code
    this.extra = extra
  }
}

export const bad = (field, message) => new ApiError(400, 'bad_request', message, { field })
export const unauthorized = (message, extra) => new ApiError(401, 'unauthorized', message, extra)
export const forbidden = (message) => new ApiError(403, 'forbidden', message)
export const notFound = (message) => new ApiError(404, 'not_found', message)
export const conflict = (code, message, extra) => new ApiError(409, code, message, extra)
