import { ErrorRequestHandler } from "express";
import multer from "multer";
import { NotFoundError, DuplicateNameError } from "../lib/errors";
import { Prisma } from "@prisma/client";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof NotFoundError) {
    return res.status(404).json({ error: { code: "NOT_FOUND", message: err.message } });
  }

  if (err instanceof DuplicateNameError) {
    return res.status(409).json({ error: { code: "DUPLICATE_NAME", message: err.message } });
  }

  if (err instanceof multer.MulterError) {
    const message = err.code === "LIMIT_FILE_SIZE" ? "Logo image must be under 2MB." : err.message;
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message } });
  }
  if (err instanceof Error && err.message === "Logo must be an image file.") {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.message } });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    return res.status(409).json({
      error: { code: "DUPLICATE_NAME", message: "A record with that unique value already exists." },
    });
  }

  console.error(err);
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Something went wrong on our end." },
  });
};
