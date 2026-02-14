import { Router, Request, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { projectController } from '../controllers/project.controller';
import { createProjectSchema, updateProjectSchema, generateCodeSchema, paginationSchema } from '../validators/project';
import { aiRateLimiter } from '../../patterns/rate-limiter';

const router = Router();

// All routes require authentication
router.use(authenticate);

// CRUD
router.post('/', validate(createProjectSchema), (req, res) => projectController.create(req, res));
router.get('/', validate(paginationSchema), (req, res) => projectController.list(req, res));
router.get('/:id', (req, res) => projectController.getById(req, res));
router.patch('/:id', validate(updateProjectSchema), (req, res) => projectController.update(req, res));
router.delete('/:id', (req, res) => projectController.delete(req, res));

// AI Code Generation (async via BullMQ — returns 202 with job ID)
router.post('/:id/generate', aiRateLimiter, validate(generateCodeSchema), (req, res) => projectController.generateCode(req, res));

// Sandbox Preview (async via BullMQ — returns 202 with sandbox ID)
router.post('/:id/sandbox', (req, res) => projectController.launchSandbox(req, res));

// Version Snapshots
router.post('/:id/snapshots', (req, res) => projectController.createSnapshot(req, res));
router.get('/:id/snapshots', (req, res) => projectController.getSnapshots(req, res));
router.post('/:id/snapshots/:version/restore', (req, res) => projectController.restoreSnapshot(req, res));

// Deployment (async via BullMQ — returns 202 with deployment ID)
router.post('/:id/deploy', (req, res) => projectController.deploy(req, res));
router.get('/:id/deployments', (req, res) => projectController.getDeployments(req, res));
router.post('/:id/deployments/:deploymentId/rollback', (req, res) => projectController.rollback(req, res));

export default router;
