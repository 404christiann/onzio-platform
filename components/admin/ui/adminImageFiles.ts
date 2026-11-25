export type AdminImageMime = "image/jpeg" | "image/png" | "image/webp";

export type AdminImageRules = {
  allowedTypes: readonly AdminImageMime[];
  maxBytes: number;
};

const labels: Record<AdminImageMime, string> = {
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WebP",
};

export function imageAccept(rules: AdminImageRules) {
  return rules.allowedTypes.join(",");
}

function typeList(rules: AdminImageRules) {
  const names = rules.allowedTypes.map((type) => labels[type]);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}` : names.join("");
}

export function imageHint(rules: AdminImageRules) {
  const types = typeList(rules);
  const limit = Number.isInteger(rules.maxBytes / 1048576)
    ? String(rules.maxBytes / 1048576)
    : (rules.maxBytes / 1048576).toFixed(1);
  return `${types} up to ${limit} MB`;
}

function readableImage(file: File) {
  return new Promise<boolean>((resolve) => {
    let url: string;
    try { url = URL.createObjectURL(file); } catch { resolve(false); return; }
    const image = new Image();
    let finished = false;
    const done = (valid: boolean) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      URL.revokeObjectURL(url);
      resolve(valid);
    };
    const timeout = window.setTimeout(() => done(false), 10000);
    image.onload = () => done(image.naturalWidth > 0 && image.naturalHeight > 0);
    image.onerror = () => done(false);
    try { image.src = url; } catch { done(false); }
  });
}

export async function imageFileIssue(file: File, rules: AdminImageRules): Promise<string | null> {
  if (!(file.type in labels) || !rules.allowedTypes.includes(file.type as AdminImageMime)) {
    return `“${file.name}” is not a supported image. Use ${typeList(rules)}.`;
  }
  if (file.size > rules.maxBytes) {
    return `“${file.name}” is too large. The limit is ${imageHint(rules).split(" up to ")[1]}.`;
  }
  if (file.size === 0 || !(await readableImage(file))) {
    return `“${file.name}” is not a readable image.`;
  }
  return null;
}

