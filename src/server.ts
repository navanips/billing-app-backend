import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { productsRouter } from "./routes/products";
import { billsRouter } from "./routes/bills";
import { usersRouter } from "./routes/users";
import { authRouter } from "./routes/auth";
import { permissionsRouter } from "./routes/permissions";
import { settingsRouter } from "./routes/settings";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

app.use(cors());
app.use(express.json());

// Uploaded logo images are served from here (e.g. /uploads/logo-123.png)
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/products", productsRouter);
app.use("/api/v1/bills", billsRouter);
app.use("/api/v1/users", usersRouter);
app.use("/api/v1/permissions", permissionsRouter);
app.use("/api/v1/settings", settingsRouter);

// 404 for unmatched routes
app.use((_req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found." } });
});

app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Billing API running on http://localhost:${PORT}`);
});
