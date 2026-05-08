import { compare } from "bcrypt-ts";
import { auth, signOut } from "@/app/(auth)/auth";
import {
  deleteUserById,
  exportUserData,
  getUserById,
  updateUserPassword,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

async function requireRegularUser() {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      error: new ChatbotError("unauthorized:auth").toResponse(),
      session: null,
    };
  }

  if (session.user.type === "guest") {
    return {
      error: new ChatbotError("forbidden:auth").toResponse(),
      session: null,
    };
  }

  return { error: null, session };
}

async function verifyCurrentPassword({
  userId,
  password,
}: {
  userId: string;
  password: string;
}) {
  const user = await getUserById({ id: userId });

  if (!user?.password) {
    return false;
  }

  return compare(password, user.password);
}

export async function GET() {
  const { error, session } = await requireRegularUser();
  if (error) {
    return error;
  }

  const data = await exportUserData({ userId: session.user.id });

  return Response.json(data, {
    headers: {
      "Content-Disposition": `attachment; filename="flowchat-export-${session.user.id}.json"`,
    },
  });
}

export async function PATCH(request: Request) {
  const { error, session } = await requireRegularUser();
  if (error) {
    return error;
  }

  let currentPassword: string;
  let newPassword: string;

  try {
    const body = await request.json();
    currentPassword = String(body.currentPassword ?? "");
    newPassword = String(body.newPassword ?? "");
  } catch {
    return new ChatbotError("bad_request:api").toResponse();
  }

  if (currentPassword.length < 1 || newPassword.length < 6) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  const passwordMatches = await verifyCurrentPassword({
    userId: session.user.id,
    password: currentPassword,
  });

  if (!passwordMatches) {
    return new ChatbotError("forbidden:auth").toResponse();
  }

  await updateUserPassword({
    userId: session.user.id,
    password: newPassword,
  });

  return Response.json({ success: true });
}

export async function DELETE(request: Request) {
  const { error, session } = await requireRegularUser();
  if (error) {
    return error;
  }

  let currentPassword: string;

  try {
    const body = await request.json();
    currentPassword = String(body.currentPassword ?? "");
  } catch {
    return new ChatbotError("bad_request:api").toResponse();
  }

  if (currentPassword.length < 1) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  const passwordMatches = await verifyCurrentPassword({
    userId: session.user.id,
    password: currentPassword,
  });

  if (!passwordMatches) {
    return new ChatbotError("forbidden:auth").toResponse();
  }

  await deleteUserById({ userId: session.user.id });

  return signOut({ redirect: false });
}
