// Optional password protection. Enabled only when STUDIO_PASSWORD is set.
export const AUTH_COOKIE = "studio_auth";

export async function authToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`reel-studio:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export const authEnabled = () => !!process.env.STUDIO_PASSWORD;
