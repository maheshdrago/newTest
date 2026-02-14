import { Request, Response } from 'express';
import { projectService } from '../../services/project/project.service';
import { deploymentService } from '../../services/deployment';

export class ProjectController {
  async create(req: Request, res: Response) {
    const project = await projectService.create(req.userId!, req.body);
    res.status(201).json({ success: true, data: project });
  }

  async getById(req: Request, res: Response) {
    const project = await projectService.getById(req.params.id, req.userId!);
    res.json({ success: true, data: project });
  }

  async list(req: Request, res: Response) {
    const result = await projectService.list(req.userId!, req.query as any);
    res.json({ success: true, data: result });
  }

  async update(req: Request, res: Response) {
    const project = await projectService.update(req.params.id, req.userId!, req.body);
    res.json({ success: true, data: project });
  }

  async delete(req: Request, res: Response) {
    await projectService.delete(req.params.id, req.userId!);
    res.status(204).send();
  }

  /**
   * Queue AI code generation — returns job ID immediately.
   * Client receives results via WebSocket.
   */
  async generateCode(req: Request, res: Response) {
    const { prompt, model, provider } = req.body;
    const result = await projectService.generateCode(req.params.id, req.userId!, prompt, model, provider);
    res.status(202).json({ success: true, data: result });
  }

  /**
   * Launch sandboxed preview environment
   */
  async launchSandbox(req: Request, res: Response) {
    const result = await projectService.launchSandbox(req.params.id, req.userId!);
    res.status(202).json({ success: true, data: result });
  }

  /**
   * Create a version snapshot
   */
  async createSnapshot(req: Request, res: Response) {
    const { label, description } = req.body;
    const snapshot = await projectService.createSnapshot(req.params.id, req.userId!, label, description);
    res.status(201).json({ success: true, data: snapshot });
  }

  /**
   * List version snapshots
   */
  async getSnapshots(req: Request, res: Response) {
    const snapshots = await projectService.getSnapshots(req.params.id, req.userId!);
    res.json({ success: true, data: snapshots });
  }

  /**
   * Restore project to a specific version
   */
  async restoreSnapshot(req: Request, res: Response) {
    const version = parseInt(req.params.version, 10);
    await projectService.restoreSnapshot(req.params.id, req.userId!, version);
    res.json({ success: true, message: `Project restored to version ${version}` });
  }

  /**
   * Queue deployment
   */
  async deploy(req: Request, res: Response) {
    const result = await deploymentService.deploy(req.params.id, req.userId!);
    res.status(202).json({ success: true, data: result });
  }

  /**
   * Get deployment status
   */
  async getDeployments(req: Request, res: Response) {
    const deployments = await deploymentService.getDeploymentsByProject(req.params.id);
    res.json({ success: true, data: deployments });
  }

  /**
   * Rollback to a previous deployment
   */
  async rollback(req: Request, res: Response) {
    const result = await deploymentService.rollback(req.params.id, req.userId!, req.params.deploymentId);
    res.status(202).json({ success: true, data: result });
  }
}

export const projectController = new ProjectController();
