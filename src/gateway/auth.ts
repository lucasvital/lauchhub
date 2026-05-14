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
    // Constant-time comparison would be ideal — but for single-admin MVP this is acceptable
    if (user !== config.ADMIN_USER || password !== config.ADMIN_PASSWORD) {
      return reply.code(401).send({ ok: false, error: 'invalid_credentials' });
    }

    const token = app.jwt.sign({ user }, { expiresIn: `${SESSION_TTL_SECONDS}s` });
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    });
    return reply.send({ ok: true, user });
  });

  app.post('/api/logout', async (_req, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.send({ ok: true });
  });

  app.get('/api/me', { preHandler: app.requireAuth }, async (req) => {
    return { ok: true, user: req.user.user };
  });
}
