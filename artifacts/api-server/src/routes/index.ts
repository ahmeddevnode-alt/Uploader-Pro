import { Router, type IRouter } from "express";
import healthRouter from "./health";
import secureIngestRouter from "./secure-ingest";
import uploaderRouter from "./uploader";
import bulkDownloadRouter from "./bulk-download";

const router: IRouter = Router();

router.use(healthRouter);
router.use(secureIngestRouter);
router.use(uploaderRouter);
router.use(bulkDownloadRouter);

export default router;
