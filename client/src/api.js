export async function readApiResponse(response) {
  const type = response.headers.get("content-type") || "";
  if (!type.includes("application/json")) {
    throw new Error(`The server could not complete this request (HTTP ${response.status}). Please try again later.`);
  }
  try { return await response.json(); }
  catch { throw new Error("The server returned an invalid response. Please try again later."); }
}
