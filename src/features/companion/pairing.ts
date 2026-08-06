const TOKEN_KEY = "voxiva-companion-token";

export function loadCompanionToken(): string {
  try {
    const existing = localStorage.getItem(TOKEN_KEY);
    if (existing && existing.length >= 8) return existing;
  } catch {
    // ignore
  }
  return rotateCompanionToken();
}

export function rotateCompanionToken(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // ignore
  }
  return token;
}
