import { Router, type IRouter } from "express";
import healthRouter from "./health";
import uploaderRouter from "./uploader";
import bulkDownloadRouter from "./bulk-download";

const router: IRouter = Router();

router.use(healthRouter);
router.use(uploaderRouter);
router.use(bulkDownloadRouter);

export default router;
