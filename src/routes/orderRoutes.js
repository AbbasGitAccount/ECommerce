import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import { createOrder, listOrders } from "../controller/orderController.js";

const router = Router();
router.get("/orders", requireRole(1, 2), listOrders);
router.post("/orders", requireRole(2), createOrder);
export default router;
