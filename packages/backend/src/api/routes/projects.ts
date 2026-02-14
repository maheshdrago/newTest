import { Router, Request, Response } from 'express';
import { projectService } from '../../services/project';
import { aiService } from '../../services/ai';
import { deploymentService } from '../../services/deployment';
import { authenticate, AuthenticatedRequest } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { createProjectSchema, updateProjectSchema, generateCodeSchema, paginationSchema } from '../validators/project';
import { aiRateLimiter } from '../../patterns/rate-limiter';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.post('/', validate(createProjectSchema), async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const project = await projectService.createProject(authReq.userId, req.body);
  res.status(201).json({ success: true, data: { project } });
});

router.get('/', validate(paginationSchema), async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const result = await projectService.listProjects(authReq.userId, {
    page: Number(req.query.page) || 1,
    pageSize: Number(req.query.pageSize) || 20,
    sortBy: req.query.sortBy as string,
    sortOrder: req.query.sortOrder as string,
    search: req.query.search as string,
    framework: req.query.framework as string,
    status: req.query.status as string,
  });
  res.json({ success: true, data: result });
});

router.get('/:id', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const project = await projectService.getProject(req.params.id, authReq.userId);
  res.json({ success: true, data: { project } });
});

router.patch('/:id', validate(updateProjectSchema), async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const project = await projectService.updateProject(req.params.id, authReq.userId, req.body);
  res.json({ success: true, data: { project } });
});

router.delete('/:id', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  await projectService.deleteProject(req.params.id, authReq.userId);
  res.status(204).send();
});

// AI Generation
router.post('/:id/generate', aiRateLimiter, validate(generateCodeSchema), async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const project = await projectService.getProject(req.params.id, authReq.userId);

  const result = await aiService.generateCode({
    projectId: project.id,
    prompt: req.body.prompt,
    userId: authReq.userId,
    existingFiles: project.files.map(f => ({ path: f.path, content: f.content })),
    framework: project.framework,
    options: req.body.options,
  });

  res.json({ success: true, data: result });
});

// Deployment
router.post('/:id/deploy', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const deployment = await deploymentService.deploy(req.params.id, authReq.userId);
  res.json({ success: true, data: { deployment } });
});

router.get('/:id/deployments', async (req: Request, res: Response) => {
  const deployments = deploymentService.getDeploymentsByProject(req.params.id);
  res.json({ success: true, data: { deployments } });
});

export default router;
