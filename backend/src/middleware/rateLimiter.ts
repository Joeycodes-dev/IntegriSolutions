import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many authentication attempts, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 400,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  // SSE stream is long-lived; don't count it against the API budget
  skip: (req) => {
    const url = (req.originalUrl as string) || req.url || req.path;
    return url.includes('/api/tests/stream') || url.includes('/api/health');
  },
});

export const syncLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10,
  message: { error: 'Too many sync requests, please try again after 1 minute' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Too many verification requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Per-user cap on top of the global Nominatim throttle in routes/geocode.ts —
// this just stops one signed-in user from spamming searches.
export const geocodeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Too many location searches, please try again shortly' },
  standardHeaders: true,
  legacyHeaders: false,
});
