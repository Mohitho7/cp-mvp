import { Router, type IRouter } from "express";
import healthRouter from "./health";
import careerDiscoveryRouter from "./careerDiscovery";
import operationsRouter from "./operations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(careerDiscoveryRouter);
router.use(operationsRouter);

export default router;
