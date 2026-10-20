export function parseProductImage(value) {
  if (value === undefined || value === null) return null;
  const invalid = () => Object.assign(new Error("Upload a valid JPEG, PNG, or WebP image up to 2 MB."), { status: 400 });
  if (typeof value !== "string" || value.length > 2800000) throw invalid();
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw invalid();
  const data = Buffer.from(match[2], "base64");
  if (!data.length || data.length > 2 * 1024 * 1024 || data.toString("base64") !== match[2]) throw invalid();
  const type = match[1];
  const valid = type === "png" ? data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : type === "jpeg" ? data[0] === 255 && data[1] === 216 && data[2] === 255
      : data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP";
  if (!valid) throw invalid();
  return { data, mime: `image/${type}` };
}
