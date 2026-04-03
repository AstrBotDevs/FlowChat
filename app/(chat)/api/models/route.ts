import {
  getAllModels,
  getCapabilitiesFromModels,
} from "@/lib/ai/models";

export async function GET() {
  const headers = {
    "Cache-Control": "public, max-age=86400, s-maxage=86400",
  };

  const models = await getAllModels();
  const capabilities = getCapabilitiesFromModels(models);

  return Response.json(
    { capabilities, models },
    { headers }
  );
}
