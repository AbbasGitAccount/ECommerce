import { getAllProducts, getApprovedProducts, insertProduct, updateProductById } from "../models/productModel.js";
import { parseProductImage } from "../services/productImage.js";

export async function listProducts(_req, res, next) {
  try {
    res.json({ status: 200, message: "Products fetched", data: await getAllProducts() });
  } catch (error) {
    next(error);
  }
}

export async function listPurchasingProducts(_req, res, next) {
  try {
    res.json({ status: 200, message: "Approved products fetched", data: await getApprovedProducts() });
  } catch (error) {
    next(error);
  }
}

function validateProduct({ name, category, price, isApproved, size, quantity }) {
  if (quantity !== undefined && (!Number.isInteger(quantity) || quantity < 0 || quantity > 2147483647)) return "Quantity must be a whole number from 0 to 2147483647.";
  if (size !== undefined && (typeof size !== "string" || size.trim().length > 50 || /[\x00-\x1f\x7f]/.test(size))) return "Size must be text up to 50 characters.";
  if (typeof name !== "string" || !name.trim() || name.trim().length > 150 ||
      typeof category !== "string" || !category.trim() || category.trim().length > 80 ||
      typeof price !== "number" || !Number.isFinite(price) || price < 0 || price > 99999999.99 ||
      Math.abs(price * 100 - Math.round(price * 100)) > 0.00001 ||
      typeof isApproved !== "boolean") {
    return "Provide a name (up to 150 characters), category (up to 80), price from 0 to 99999999.99 with at most two decimals, and a boolean isApproved.";
  }
  return null;
}

export async function createProduct(req, res, next) {
  const { name, category, price, isApproved = false, size = "", image, quantity = 0 } = req.body ?? {};
  const message = validateProduct({ name, category, price, isApproved, size, quantity });
  if (message) return res.status(400).json({ status: 400, message });
  try {
    const product = await insertProduct({ name: name.trim(), category: category.trim(), price, isApproved, size: size.trim(), image: parseProductImage(image), quantity });
    res.status(201).json({ status: 201, message: "Product created successfully", data: product });
  } catch (error) {
    next(error);
  }
}

export async function updateProduct(req, res, next) {
  const id = Number(req.params.id);
  if (!/^\d+$/.test(req.params.id) || !Number.isSafeInteger(id) || id < 1 || id > 2147483647) {
    return res.status(400).json({ status: 400, message: "A valid product ID is required" });
  }
  const { name, category, price, isApproved, size, image, quantity } = req.body ?? {};
  const message = validateProduct({ name, category, price, isApproved, size, quantity });
  if (message) return res.status(400).json({ status: 400, message });
  try {
    const product = await updateProductById(id, { name: name.trim(), category: category.trim(), price, isApproved, size: size?.trim(), image: parseProductImage(image), replaceImage: image !== undefined, quantity });
    if (!product) return res.status(404).json({ status: 404, message: "Product not found" });
    res.json({ status: 200, message: "Product updated successfully", data: product });
  } catch (error) {
    next(error);
  }
}
