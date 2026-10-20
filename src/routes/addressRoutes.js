import { Router } from "express";
import Joi from "joi";
import { requireRole } from "../middleware/auth.js";
import { deleteAddress, listAddresses, saveAddress } from "../models/addressModel.js";

const text = (max) => Joi.string().trim().max(max).pattern(/^[^\x00-\x1f\x7f]+$/).required();
export const addressSchema = Joi.object({
  recipient: text(150),
  phone: Joi.string().trim().min(7).max(30).pattern(/^[+\d() .-]+$/).custom((value, helpers) => value.replace(/\D/g, "").length >= 7 ? value : helpers.error("any.invalid")).required(),
  line1: text(200), line2: Joi.string().trim().max(200).pattern(/^[^\x00-\x1f\x7f]*$/).allow("").default(""),
  city: text(100), state: text(100), postal_code: text(20), country: text(100),
}).unknown(false);

const router = Router();
router.use("/addresses", requireRole(1, 2));
router.param("id", (req, res, next, id) => {
  if (!/^[1-9]\d*$/.test(id) || Number(id) > 2147483647) return res.status(400).json({ message: "Invalid address ID" });
  next();
});
router.get("/addresses", async (req, res, next) => {
  try { res.json({ data: await listAddresses(req.user.id) }); } catch (err) { next(err); }
});
async function save(req, res, next) {
  const { value, error } = addressSchema.validate(req.body);
  if (error || !value) return res.status(400).json({ message: "Provide recipient, phone, street, city, state, postal code, and country. Address fields must be valid text within the allowed lengths." });
  try {
    const address = await saveAddress(req.user.id, value, req.params.id ? Number(req.params.id) : null);
    if (!address) return res.status(404).json({ message: "Address not found" });
    res.status(req.params.id ? 200 : 201).json({ data: address });
  } catch (err) { next(err); }
}
router.post("/addresses", save);
router.put("/addresses/:id", save);
router.delete("/addresses/:id", async (req, res, next) => {
  try {
    const address = await deleteAddress(req.user.id, Number(req.params.id));
    if (!address) return res.status(404).json({ message: "Address not found" });
    res.json({ message: "Address removed" });
  } catch (err) { next(err); }
});
export default router;
