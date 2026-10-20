import { Router } from "express";
import Joi from "joi";
import { requireRole } from "../middleware/auth.js";
import { answerOrderQuestion } from "../services/askData.js";

const schema = Joi.object({
  question: Joi.string().trim().min(3).max(500).pattern(/^[^\x00-\x1f\x7f]+$/).required(),
  scope: Joi.string().valid("mine", "all").default("mine"),
  offset: Joi.number().integer().min(0).max(1000000).default(0),
}).unknown(false);

const router = Router();
router.post("/ask-data", requireRole(1, 2), async (req, res) => {
  const { error, value } = schema.validate(req.body);
  if (error || !value) return res.status(400).json({ message: "Provide a question of 3–500 characters, scope mine or all, and an optional integer offset from 0 to 1000000. No other fields are accepted." });
  try {
    res.json({ data: await answerOrderQuestion(req.user, value) });
  } catch (err) {
    // Do not send database errors, queries, or credentials to the browser.
    const status = [400, 403].includes(err.status) ? err.status : 500;
    if (status === 500) console.error("Ask Your Data query failed:", err.code || "query_error");
    res.status(status).json({ message: status === 500 ? "Could not query your orders. Please try again." : err.message });
  }
});
export default router;
