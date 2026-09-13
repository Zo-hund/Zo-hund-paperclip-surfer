export type IdentityImagePurpose = "profile-avatar" | "partner-logo";

const MAX_IDENTITY_IMAGE_BYTES = 5 * 1024 * 1024;
const IDENTITY_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface IdentityImageUpload {
  id: string;
  url: string;
  fileName: string;
  contentType: string;
  size: number;
}

export function validateIdentityImage(file: File) {
  if (!IDENTITY_IMAGE_TYPES.has(file.type.toLowerCase())) throw new Error("Choose a PNG, JPEG, or WebP image.");
  if (!file.size) throw new Error("The selected image is empty.");
  if (file.size > MAX_IDENTITY_IMAGE_BYTES) throw new Error("Identity images are limited to 5 MB.");
}

export async function uploadIdentityImage(file: File, tenantId: string, purpose: IdentityImagePurpose) {
  validateIdentityImage(file);
  const response = await fetch("/api/media", {
    method: "POST",
    headers: {
      "Content-Type": file.type,
      "X-AMX-Filename": file.name,
      "X-AMX-Tenant": tenantId,
      "X-AMX-Media-Purpose": purpose,
      "X-AMX-Visibility": "public",
    },
    body: file,
  });
  const result = await response.json() as Partial<IdentityImageUpload> & { error?: string };
  if (!response.ok || !result.id || !result.url) throw new Error(result.error || "Image upload failed.");
  return result as IdentityImageUpload;
}
