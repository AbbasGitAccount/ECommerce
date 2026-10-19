import { findLoginUser, registerLoginUser } from "../models/loginModel.js";
import { startSession } from "../middleware/auth.js";

const respond = (res, status, message, data = null) =>
  res.status(status).json({ status, message, data });

const getCredentials = (body) => ({
  username: body?.username ?? body?.Username,
  password: body?.password ?? body?.Password,
});

const validCredentials = ({ username, password }) =>
  typeof username === "string" && username.trim().length >= 3 &&
  typeof password === "string" && password.length >= 8;

export const register = async (req, res, next) => {
  const credentials = getCredentials(req.body);
  if (!validCredentials(credentials)) {
    return respond(res, 400, "Username must be at least 3 characters and password at least 8 characters");
  }

  const { name = credentials.username, email = "" } = req.body ?? {};
  if (typeof name !== "string" || !name.trim() || typeof email !== "string" ||
      (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))) {
    return respond(res, 400, "Provide a name and a valid email address");
  }

  try {
    const user = await registerLoginUser(credentials.username.trim(), credentials.password, {
      name: name.trim(), email: email.trim(), role: 2,
    });
    return respond(res, 201, "Account created successfully", user);
  } catch (error) {
    if (error.code === "23505") return respond(res, 409, "Username is already taken");
    return next(error);
  }
};

export const login = async (req, res, next) => {
  const credentials = getCredentials(req.body);
  if (!validCredentials(credentials)) {
    return respond(res, 400, "Username and password are required (password must be at least 8 characters)");
  }

  try {
    const user = await findLoginUser(credentials.username.trim(), credentials.password);
    if (!user) return respond(res, 401, "Invalid username or password");
    startSession(req, res, user);
    return respond(res, 200, "Login successful", user);
  } catch (error) {
    return next(error);
  }
};
