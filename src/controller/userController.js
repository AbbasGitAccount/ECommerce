import {
  deleteUserService,
  getAllUsersService,
  getUserByIdService,
  updateUserService,
} from "../models/userModel.js";
import { registerLoginUser } from "../models/loginModel.js";

const respond = (res, status, message, data = null) =>
  res.status(status).json({ status, message, data });

const validId = (value) => /^\d+$/.test(value) && Number(value) > 0;

const getUserFields = (body) => {
  const fields = body ?? {};
  return {
    name: fields.name ?? fields.Name ?? fields.username ?? fields.Username,
    email: fields.email ?? fields.Email,
    username: fields.username ?? fields.Username,
    password: fields.password ?? fields.Password,
    role: fields.role ?? 2,
  };
};

const validUserBody = (fields) =>
  typeof fields.name === "string" && fields.name.trim() &&
  typeof fields.email === "string" && fields.email.trim() &&
  typeof fields.username === "string" && fields.username.trim().length >= 3 &&
  typeof fields.password === "string" && fields.password.length >= 8;

export const createUser = async (req, res, next) => {
  const fields = getUserFields(req.body);
  if (!validUserBody(fields) || ![1, 2].includes(fields.role)) {
    return respond(res, 400, "Name and email are required; username must be at least 3 characters and password at least 8 characters");
  }
  try {
    const user = await registerLoginUser(fields.username.trim(), fields.password, {
      name: fields.name.trim(),
      email: fields.email.trim(),
      role: fields.role,
    });
    return respond(res, 201, "User created successfully", user);
  } catch (error) {
    if (error.code === "23505") return respond(res, 409, "Username is already taken");
    return next(error);
  }
};

export const getAllUsers = async (_req, res, next) => {
  try {
    const users = await getAllUsersService();
    return respond(res, 200, "Users fetched successfully", users);
  } catch (error) {
    return next(error);
  }
};

export const getUserById = async (req, res, next) => {
  if (!validId(req.params.id)) return respond(res, 400, "A valid user ID is required");
  try {
    const user = await getUserByIdService(Number(req.params.id));
    if (!user) return respond(res, 404, "User not found");
    return respond(res, 200, "User fetched successfully", user);
  } catch (error) {
    return next(error);
  }
};

export const updateUser = async (req, res, next) => {
  if (!validId(req.params.id)) return respond(res, 400, "A valid user ID is required");
  const fields = getUserFields(req.body);
  if (typeof fields.name !== "string" || !fields.name.trim() || typeof fields.email !== "string" || !fields.email.trim()) {
    return respond(res, 400, "Name and email are required");
  }
  try {
    const user = await updateUserService(Number(req.params.id), fields.name.trim(), fields.email.trim());
    if (!user) return respond(res, 404, "User not found");
    return respond(res, 200, "User updated successfully", user);
  } catch (error) {
    return next(error);
  }
};

export const deleteUser = async (req, res, next) => {
  if (!validId(req.params.id)) return respond(res, 400, "A valid user ID is required");
  try {
    const user = await deleteUserService(Number(req.params.id));
    if (!user) return respond(res, 404, "User not found");
    return respond(res, 200, "User deleted successfully", user);
  } catch (error) {
    return next(error);
  }
};
