"use server";

import { z } from "zod";

import { createUser, getUser, migrateUserData } from "@/lib/db/queries";

import { auth, signIn } from "./auth";

const authFormSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export type LoginActionState = {
  status: "idle" | "in_progress" | "success" | "failed" | "invalid_data";
};

export const login = async (
  _: LoginActionState,
  formData: FormData
): Promise<LoginActionState> => {
  try {
    const validatedData = authFormSchema.parse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    const currentSession = await auth();

    await signIn("credentials", {
      email: validatedData.email,
      password: validatedData.password,
      redirect: false,
    });

    const [targetUser] = await getUser(validatedData.email);
    if (
      currentSession?.user?.type === "guest" &&
      currentSession.user.id &&
      targetUser?.id
    ) {
      await migrateUserData({
        fromUserId: currentSession.user.id,
        toUserId: targetUser.id,
      });
    }

    return { status: "success" };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { status: "invalid_data" };
    }

    return { status: "failed" };
  }
};

export type RegisterActionState = {
  status:
    | "idle"
    | "in_progress"
    | "success"
    | "failed"
    | "user_exists"
    | "invalid_data";
};

export const register = async (
  _: RegisterActionState,
  formData: FormData
): Promise<RegisterActionState> => {
  try {
    const validatedData = authFormSchema.parse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    const [user] = await getUser(validatedData.email);

    if (user) {
      return { status: "user_exists" } as RegisterActionState;
    }

    const currentSession = await auth();
    await createUser(validatedData.email, validatedData.password);

    const [createdUser] = await getUser(validatedData.email);

    if (
      currentSession?.user?.type === "guest" &&
      currentSession.user.id &&
      createdUser?.id
    ) {
      await migrateUserData({
        fromUserId: currentSession.user.id,
        toUserId: createdUser.id,
      });
    }

    await signIn("credentials", {
      email: validatedData.email,
      password: validatedData.password,
      redirect: false,
    });

    return { status: "success" };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { status: "invalid_data" };
    }

    return { status: "failed" };
  }
};
