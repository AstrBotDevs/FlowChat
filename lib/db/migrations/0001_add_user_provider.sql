CREATE TABLE IF NOT EXISTS "UserProvider" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" uuid NOT NULL REFERENCES "User"("id"),
  "providerId" varchar(64) NOT NULL,
  "apiKey" text NOT NULL,
  "baseUrl" text,
  "providerType" varchar NOT NULL DEFAULT 'openai-compatible',
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "UserProvider_userId_providerId_unique" UNIQUE("userId", "providerId")
);
