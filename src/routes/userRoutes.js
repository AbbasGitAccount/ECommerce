import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import {
  createUser,
  deleteUser,
  getAllUsers,
  getUserById,
  updateUser,
} from "../controller/userController.js";

const router = Router();

router.get("/users", requireRole(1), getAllUsers);
router.get("/users/:id", requireRole(1), getUserById);
router.post("/users", requireRole(1), createUser);
router.put("/users/:id", requireRole(1), updateUser);
router.delete("/users/:id", requireRole(1), deleteUser);

export default router;
