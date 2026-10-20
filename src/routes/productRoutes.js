import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import pool from "../config/db.js";
import { createProduct, listProducts, listPurchasingProducts, updateProduct } from "../controller/productController.js";

const router = Router();
router.get("/products", requireRole(1), listProducts);
router.get("/purchasing/products", requireRole(2), listPurchasingProducts);
router.post("/products", requireRole(1), createProduct);
router.put("/products/:id", requireRole(1), updateProduct);
router.get("/product-images/:id", requireRole(1, 2), async (req, res, next) => {
  const id = Number(req.params.id);
  if (!/^[1-9]\d*$/.test(req.params.id) || id > 2147483647) return res.status(400).json({ message: "Invalid product ID" });
  try {
    const result = await pool.query('SELECT image_data, image_mime FROM products WHERE id=$1 AND ($2::integer=1 OR "isApproved"=TRUE)', [id, req.user.role]);
    const product = result.rows[0];
    if (!product?.image_data) return res.sendStatus(404);
    res.set({ "Content-Type": product.image_mime, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" }).send(product.image_data);
  } catch (error) { next(error); }
});
export default router;
