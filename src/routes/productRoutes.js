import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import { createProduct, listProducts, listPurchasingProducts, updateProduct } from "../controller/productController.js";

const router = Router();
router.get("/products", requireRole(1), listProducts);
router.get("/purchasing/products", requireRole(2), listPurchasingProducts);
router.post("/products", requireRole(1), createProduct);
router.put("/products/:id", requireRole(1), updateProduct);
export default router;
