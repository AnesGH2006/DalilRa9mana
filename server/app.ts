import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { authMiddleware } from "./middlewares/authMiddleware.js";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";

const app: Express = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDistDir = [
  path.resolve(__dirname, "../public"),
  path.resolve(__dirname, "../dist/public"),
].find(candidate => existsSync(path.join(candidate, "index.html")))
  ?? path.resolve(__dirname, "../dist/public");

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) { return { id: req.id, method: req.method, url: req.url?.split("?")[0] }; },
      res(res) { return { statusCode: res.statusCode }; },
    },
  }),
);
app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json({
  limit: "20mb",
  verify: (req, _res, buffer) => {
    (req as RequestWithRawBody).rawBody = buffer.toString("utf8");
  },
}));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
app.use(authMiddleware);

app.use("/api", router);
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "مسار API غير موجود. حدّث التطبيق أو تحقق من عنوان الخدمة." });
});

if (existsSync(path.join(clientDistDir, "index.html"))) {
  app.use(express.static(clientDistDir));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(clientDistDir, "index.html"));
  });
}

export default app;

interface RequestWithRawBody extends express.Request {
  rawBody?: string;
}
