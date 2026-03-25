import type { Session } from "next-auth";
import type { DefaultSession } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";
import { isMockMode, MOCK_SESSION } from "@/lib/mock/index";

export type UserType = "guest" | "regular";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      type: UserType;
    } & DefaultSession["user"];
  }

  interface User {
    id?: string;
    email?: string | null;
    type: UserType;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    type: UserType;
  }
}

// In mock mode we avoid importing NextAuth, DB queries, and bcrypt entirely
// so there is no attempt to connect to a database or generate a dummy password.

async function initAuth() {
  if (isMockMode) {
    return {
      handlers: {
        GET: () => new Response("Mock auth", { status: 200 }),
        POST: () => new Response("Mock auth", { status: 200 }),
      },
      auth: (() => Promise.resolve(MOCK_SESSION as Session)) as any,
      signIn: (() => Promise.resolve()) as any,
      signOut: (() => Promise.resolve()) as any,
    };
  }

  const { compare } = await import("bcrypt-ts");
  const NextAuth = (await import("next-auth")).default;
  const Credentials = (await import("next-auth/providers/credentials")).default;
  const { DUMMY_PASSWORD } = await import("@/lib/constants");
  const { createGuestUser, getUser } = await import("@/lib/db/queries");
  const { authConfig } = await import("./auth.config");

  const nextAuth = NextAuth({
    ...authConfig,
    providers: [
      Credentials({
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Password", type: "password" },
        },
        async authorize(credentials) {
          const email = String(credentials.email ?? "");
          const password = String(credentials.password ?? "");
          const users = await getUser(email);

          if (users.length === 0) {
            await compare(password, DUMMY_PASSWORD);
            return null;
          }

          const [user] = users;

          if (!user.password) {
            await compare(password, DUMMY_PASSWORD);
            return null;
          }

          const passwordsMatch = await compare(password, user.password);

          if (!passwordsMatch) {
            return null;
          }

          return { ...user, type: "regular" as const };
        },
      }),
      Credentials({
        id: "guest",
        credentials: {},
        async authorize() {
          const [guestUser] = await createGuestUser();
          return { ...guestUser, type: "guest" as const };
        },
      }),
    ],
    callbacks: {
      jwt({ token, user }) {
        if (user) {
          token.id = user.id as string;
          token.type = user.type;
        }

        return token;
      },
      session({ session, token }) {
        if (session.user) {
          session.user.id = token.id;
          session.user.type = token.type;
        }

        return session;
      },
    },
  });

  return {
    handlers: nextAuth.handlers,
    auth: nextAuth.auth,
    signIn: nextAuth.signIn,
    signOut: nextAuth.signOut,
  };
}

const authPromise = initAuth();

export const GET = async (...args: any[]) => {
  const { handlers } = await authPromise;
  return (handlers.GET as Function)(...args);
};

export const POST = async (...args: any[]) => {
  const { handlers } = await authPromise;
  return (handlers.POST as Function)(...args);
};

export const auth = (async (...args: any[]) => {
  const resolved = await authPromise;
  return (resolved.auth as Function)(...args);
}) as any;

export const signIn = (async (...args: any[]) => {
  const resolved = await authPromise;
  return (resolved.signIn as Function)(...args);
}) as any;

export const signOut = (async (...args: any[]) => {
  const resolved = await authPromise;
  return (resolved.signOut as Function)(...args);
}) as any;
