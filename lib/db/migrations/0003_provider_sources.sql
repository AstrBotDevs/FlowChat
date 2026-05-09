ALTER TABLE "UserProvider" ADD COLUMN "displayName" text;
ALTER TABLE "UserProvider" ADD COLUMN "models" json DEFAULT '[]'::json NOT NULL;

UPDATE "UserProvider"
SET "providerType" = "providerId", "baseUrl" = NULL
WHERE "providerId" IN (
  'openai',
  'anthropic',
  'google',
  'deepseek',
  'moonshotai',
  'alibaba',
  'xai'
);
