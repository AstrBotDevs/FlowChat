export const isMockMode =
  process.env.MOCK_MODE === "true" || !process.env.POSTGRES_URL;

export const MOCK_USER_ID = "00000000-0000-4000-8000-000000000001";

export const MOCK_SESSION = {
  user: {
    id: MOCK_USER_ID,
    type: "guest" as const,
    name: "Demo User",
    email: "demo@example.com",
  },
  expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
};
