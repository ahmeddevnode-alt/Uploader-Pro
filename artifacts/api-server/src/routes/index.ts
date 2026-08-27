import { Router, type IRouter } from "express";
import healthRouter from "./health";
import uploaderRouter from "./uploader";

const router: IRouter = Router();

router.use(healthRouter);
router.use(uploaderRouter);

export default router;
