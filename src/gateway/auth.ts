import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import { config } from '../config.js';

const SESSION_COOKIE = 'lh_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

declare module 'fastify' {
  interface FastifyInstance {
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { user: string };
    user: { user: string };
  }
}

export async function registerAuth(app: FastifyInstance): Promise<void> {
  await app.register(fastifyCookie);
  await app.register(fastifyJwt, {
    secret: config.SESSION_SECRET,
    cookie: { cookieName: SESSION_COOKIE, signed: false },
  });

  /**
   * Auth accepts EITHER mechanism, in this order:
   *   1. Authorization: Bearer <jwt>      ← used by Safari (ITP blocks 3rd-party cookies)
   *   2. Cookie `lh_session=<jwt>`        ← used by Chrome/Firefox/Edge cross-origin
   *
   * The login response returns both a Set-Cookie header AND a `token` field
   * so the client picks whichever works for its browser.
   */
  app.decorate('requireAuth', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ ok: false, error: 'unauthorized' });
    }
  });

  app.post<{ Body: { user: string; password: string } }>('/api/login', async (req, reply) => {
    const { user, password } = req.body ?? {};
    if (!user || !password) {
      return reply.code(400).send({ ok: false, error: 'missing_fields' });
    }
    if (!config.ADMIN_PASSWORD) {
      return reply.code(503).send({ ok: false, error: 'admin_not_configured' });
    }
    if (user !== config.ADMIN_USER || password !== config.ADMIN_PASSWORD) {
      return reply.code(401).send({ ok: false, error: 'invalid_credentials' });
    }

    const token = app.jwt.sign({ user }, { expiresIn: `${SESSION_TTL_SECONDS}s` });
    const isProd = config.NODE_ENV === 'production';
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    });
    // Token also returned in body — Safari/ITP-blocked clients keep it in
    // localStorage and send as `Authorization: Bearer <token>`.
    return reply.send({ ok: true, user, token, expires_in: SESSION_TTL_SECONDS });
  });

  app.post('/api/logout', async (_req, reply) => {
    const isProd = config.NODE_ENV === 'production';
    reply.clearCookie(SESSION_COOKIE, {
      path: '/',
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
    });
    return reply.send({ ok: true });
  });

  app.get('/api/me', { preHandler: app.requireAuth }, async (req) => {
    return { ok: true, user: req.user.user };
  });
}
