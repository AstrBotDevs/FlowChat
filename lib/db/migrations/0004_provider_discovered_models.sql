ALTER TABLE "UserProvider" ADD COLUMN "discoveredModels" json DEFAULT '[]'::json NOT NULL;
