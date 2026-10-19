import { Router } from "express";
import { login, register } from "../controller/loginController.js";
import { logout } from "../middleware/auth.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);

export default router;
