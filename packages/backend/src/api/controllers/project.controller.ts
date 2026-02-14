import { Request, Response } from 'express';
import { projectService } from '../../services/project/project.service';

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
}

export const projectController = new ProjectController();
