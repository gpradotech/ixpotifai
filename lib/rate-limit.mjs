export function retryAfterMilliseconds(value,now=Date.now()) {
  if(value && /^\d+$/.test(value.trim())){const ms=Number(value.trim())*1000;return Number.isFinite(ms)?ms:null;}
  const date=value?Date.parse(value):NaN;
  return Number.isFinite(date)?Math.max(0,date-now):null;
}

export class RateLimitError extends Error {
  constructor(source,retryAfter,now=Date.now()) {
    super(`A fonte ${source} respondeu HTTP 429.`);
    this.status=429;this.source=source;
    this.retryAfterMs=retryAfterMilliseconds(retryAfter,now);
  }
}

export function isRateLimit(error){return error?.status===429;}
export function rateLimitDelay(error,attempt=1){return Math.max(error.retryAfterMs ?? 0,60000*2**(attempt-1));}
