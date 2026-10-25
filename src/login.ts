import { betterAuth } from 'better-auth';
import { emailOTP } from 'better-auth/plugins';
import type { Env } from './types.js';
import { PalimError } from './errors.js';

export function authOptions(env: Env, claim?: string) {
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32)
    throw new PalimError(
      'CONFIGURATION',
      'The operator must configure an authentication secret.',
      503,
    );
  return {
    database: env.DB,
    baseURL: env.ORIGIN,
    basePath: '/auth',
    secret: env.AUTH_SECRET,
    trustedOrigins: [env.ORIGIN],
    telemetry: { enabled: false },
    logger: { disabled: true },
    user: { modelName: 'auth_users' },
    account: { modelName: 'auth_accounts' },
    verification: { modelName: 'auth_verifications' },
    session: {
      modelName: 'auth_sessions',
      expiresIn: 7 * 86400,
      cookieCache: { enabled: false },
    },
    advanced: {
      // Avoid automatic __Secure- naming; explicit __Host- name and Secure attributes below.
      useSecureCookies: false,
      defaultCookieAttributes: {
        secure: true,
        httpOnly: true,
        sameSite: 'lax' as const,
        path: '/',
      },
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
      cookies: {
        session_token: {
          name: '__Host-palim',
          attributes: { secure: true, httpOnly: true, sameSite: 'lax' as const, path: '/' },
        },
      },
    },
    rateLimit: {
      enabled: true,
      storage: 'database' as const,
      modelName: 'auth_rate_limits',
      window: 60,
      max: 100,
      customRules: { '/email-otp/send-verification-otp': { window: 60, max: 6 } },
    },
    plugins: [
      emailOTP({
        storeOTP: 'encrypted',
        expiresIn: 300,
        allowedAttempts: 3,
        async sendVerificationOTP({ email, otp, type }) {
          if (!claim || type !== 'sign-in')
            throw new PalimError('MAIL_ADMISSION', 'Request a new sign-in code.', 429);
          const admitted = await env.DB.prepare(
            "UPDATE mail_attempts SET dispatched=1 WHERE id=? AND purpose='login' AND dispatched=0 RETURNING id",
          )
            .bind(claim)
            .first();
          if (!admitted) throw new PalimError('MAIL_ADMISSION', 'Request a new sign-in code.', 429);
          try {
            await env.EMAIL.send({
              from: { email: env.SENDER, name: 'Palim' },
              to: email,
              subject: 'Your Palim sign-in code',
              text: `Your Palim sign-in code is ${otp}. It expires in five minutes. If you did not request it, ignore this email.`,
              attachments: [],
              headers: {},
            });
          } catch {
            throw new PalimError(
              'LOGIN_EMAIL',
              'The sign-in email could not be confirmed. Request another code after a minute.',
              503,
            );
          }
        },
      }),
    ],
  } satisfies Parameters<typeof betterAuth>[0];
}

export function authentication(env: Env, claim?: string) {
  return betterAuth(authOptions(env, claim));
}
