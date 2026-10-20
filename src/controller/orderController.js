import { getOrderHistory, insertOrder, updateOrderStatus } from "../models/orderModel.js";
import Joi from "joi";

const statusSchema = Joi.object({ status: Joi.string().valid("out_for_delivery", "delivered").required() }).unknown(false);

export async function changeOrderStatus(req, res, next) {
  const id = Number(req.params.id);
  const { value, error } = statusSchema.validate(req.body);
  if (!/^[1-9]\d*$/.test(req.params.id) || !validId(id) || error || !value) {
    return res.status(400).json({ message: "Provide a valid order ID and status out_for_delivery or delivered." });
  }
  try {
    res.json({ message: "Order status updated", data: await updateOrderStatus(id, value.status) });
  } catch (err) { next(err); }
}

export async function listOrders(req, res, next) {
  try {
    res.json({ status: 200, message: "Order history fetched", data: await getOrderHistory(req.user) });
  } catch (error) { next(error); }
}

const validId = (id) => Number.isInteger(id) && id > 0 && id <= 2147483647;

export async function createOrder(req, res, next) {
  const { items, addressId } = req.body ?? {};
  const userId = req.user.id;
  if (!validId(addressId)) return res.status(400).json({ message: "Select a saved delivery address before booking." });
  if (!validId(userId) || !Array.isArray(items) || items.length === 0 || items.length > 100 ||
      items.some((item) => !item || !validId(item.productId) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 999) ||
      new Set(items.map((item) => item.productId)).size !== items.length) {
    return res.status(400).json({ status: 400, message: "Provide a valid user and 1–100 different products with quantities from 1 to 999." });
  }
  try {
    const order = await insertOrder(userId, items, addressId);
    res.status(201).json({ status: 201, message: "Products booked successfully", data: order });
  } catch (error) {
    next(error);
  }
}
