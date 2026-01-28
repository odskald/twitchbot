"use server";

import { cookies } from "next/headers";

export async function checkSettingsPassword(password: string) {
  // Use env var or default to "admin"
  const correctPassword = process.env.SETTINGS_PASSWORD || "admin";
  
  if (password === correctPassword) {
    // Set a cookie that lasts for 24 hours
    cookies().set("settings_auth", "true", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24,
      path: "/",
    });
    return { success: true };
  }
  
  return { success: false, error: "Incorrect password" };
}

export async function isSettingsAuthenticated() {
  const cookieStore = cookies();
  return cookieStore.get("settings_auth")?.value === "true";
}