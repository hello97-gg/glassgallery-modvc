import { onRequest as reelsHandler } from "../api/reels.js";

export async function onRequest(context) {
  return reelsHandler(context);
}
