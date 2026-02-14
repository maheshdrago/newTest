import { logger } from '../../core/logger';

// Command interface
export interface Command<TResult = void> {
  readonly type: string;
}

// Query interface
export interface Query<TResult = unknown> {
  readonly type: string;
}

// Command Handler
export interface CommandHandler<TCommand extends Command<TResult>, TResult = void> {
  execute(command: TCommand): Promise<TResult>;
}

// Query Handler
export interface QueryHandler<TQuery extends Query<TResult>, TResult = unknown> {
  execute(query: TQuery): Promise<TResult>;
}

// Command Bus
class CommandBus {
  private handlers = new Map<string, CommandHandler<any, any>>();

  register<TCommand extends Command<TResult>, TResult>(
    commandType: string,
    handler: CommandHandler<TCommand, TResult>
  ): void {
    this.handlers.set(commandType, handler);
    logger.debug(`Command handler registered: ${commandType}`);
  }

  async dispatch<TResult>(command: Command<TResult>): Promise<TResult> {
    const handler = this.handlers.get(command.type);
    if (!handler) {
      throw new Error(`No handler registered for command: ${command.type}`);
    }
    logger.debug(`Dispatching command: ${command.type}`);
    return handler.execute(command);
  }
}

// Query Bus
class QueryBus {
  private handlers = new Map<string, QueryHandler<any, any>>();

  register<TQuery extends Query<TResult>, TResult>(
    queryType: string,
    handler: QueryHandler<TQuery, TResult>
  ): void {
    this.handlers.set(queryType, handler);
    logger.debug(`Query handler registered: ${queryType}`);
  }

  async dispatch<TResult>(query: Query<TResult>): Promise<TResult> {
    const handler = this.handlers.get(query.type);
    if (!handler) {
      throw new Error(`No handler registered for query: ${query.type}`);
    }
    logger.debug(`Dispatching query: ${query.type}`);
    return handler.execute(query);
  }
}

export const commandBus = new CommandBus();
export const queryBus = new QueryBus();
