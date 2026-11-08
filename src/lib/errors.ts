export class InsufficientStockError extends Error {
  items: { productId: number; requested: number; available: number }[];

  constructor(items: { productId: number; requested: number; available: number }[]) {
    super("Some items don't have enough stock.");
    this.name = "InsufficientStockError";
    this.items = items;
  }
}

export class DuplicateNameError extends Error {
  constructor(message = "A product with this name already exists.") {
    super(message);
    this.name = "DuplicateNameError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "Resource not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}
