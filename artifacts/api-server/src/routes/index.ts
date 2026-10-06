import { Router, type IRouter } from "express";
import healthRouter from "./health";
import careerDiscoveryRouter from "./careerDiscovery";

const router: IRouter = Router();

router.use(healthRouter);
router.use(careerDiscoveryRouter);

export default router;
