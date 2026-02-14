import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Enable UUID extension
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // Users table
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('email', 255).unique().notNullable();
    table.string('password_hash', 255).notNullable();
    table.string('name', 255).notNullable();
    table.string('avatar_url', 512);
    table.enum('role', ['admin', 'member', 'viewer']).defaultTo('member');
    table.enum('plan', ['free', 'pro', 'team', 'enterprise']).defaultTo('free');
    table.jsonb('preferences').defaultTo('{}');
    table.timestamp('last_login_at');
    table.timestamps(true, true);
  });

  // Projects table
  await knex.schema.createTable('projects', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('name', 255).notNullable();
    table.text('description');
    table.enum('framework', ['react', 'nextjs', 'vue', 'svelte', 'vanilla']).defaultTo('react');
    table.enum('status', ['draft', 'generating', 'ready', 'deploying', 'deployed', 'error', 'archived']).defaultTo('draft');
    table.enum('visibility', ['private', 'public', 'team']).defaultTo('private');
    table.uuid('owner_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.integer('current_version').defaultTo(1);
    table.jsonb('settings').defaultTo('{}');
    table.jsonb('metadata').defaultTo('{}');
    table.timestamps(true, true);
  });

  // Project files table
  await knex.schema.createTable('project_files', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('project_id').notNullable().references('id').inTable('projects').onDelete('CASCADE');
    table.string('path', 512).notNullable();
    table.text('content').notNullable();
    table.string('language', 50);
    table.string('checksum', 64);
    table.integer('size_bytes').defaultTo(0);
    table.integer('version').defaultTo(1);
    table.timestamps(true, true);
    table.unique(['project_id', 'path', 'version']);
  });

  // Project snapshots (version history)
  await knex.schema.createTable('project_snapshots', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('project_id').notNullable().references('id').inTable('projects').onDelete('CASCADE');
    table.integer('version').notNullable();
    table.string('label', 255);
    table.text('description');
    table.uuid('created_by').references('id').inTable('users');
    table.jsonb('file_manifest').notNullable(); // { path: checksum } mapping
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.unique(['project_id', 'version']);
  });

  // Deployments table
  await knex.schema.createTable('deployments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('project_id').notNullable().references('id').inTable('projects').onDelete('CASCADE');
    table.integer('version').notNullable();
    table.enum('status', ['queued', 'building', 'deploying', 'live', 'failed', 'rolled_back']).defaultTo('queued');
    table.string('url', 512);
    table.string('container_id', 255);
    table.jsonb('build_logs').defaultTo('[]');
    table.jsonb('environment').defaultTo('{}');
    table.timestamp('started_at');
    table.timestamp('completed_at');
    table.timestamps(true, true);
  });

  // AI generation jobs table
  await knex.schema.createTable('generation_jobs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('project_id').notNullable().references('id').inTable('projects').onDelete('CASCADE');
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.text('prompt').notNullable();
    table.string('model', 100);
    table.string('provider', 50);
    table.enum('status', ['queued', 'processing', 'completed', 'failed']).defaultTo('queued');
    table.jsonb('result');
    table.integer('tokens_used').defaultTo(0);
    table.decimal('cost', 10, 6).defaultTo(0);
    table.integer('duration_ms');
    table.text('error_message');
    table.timestamps(true, true);
  });

  // Collaboration sessions
  await knex.schema.createTable('collaboration_sessions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('project_id').notNullable().references('id').inTable('projects').onDelete('CASCADE');
    table.jsonb('participants').defaultTo('[]');
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);
  });

  // Audit logs
  await knex.schema.createTable('audit_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').references('id').inTable('users');
    table.string('action', 100).notNullable();
    table.string('resource_type', 50).notNullable();
    table.uuid('resource_id');
    table.jsonb('details').defaultTo('{}');
    table.string('ip_address', 45);
    table.string('user_agent', 512);
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Indexes
  await knex.schema.raw('CREATE INDEX idx_projects_owner ON projects(owner_id)');
  await knex.schema.raw('CREATE INDEX idx_project_files_project ON project_files(project_id)');
  await knex.schema.raw('CREATE INDEX idx_deployments_project ON deployments(project_id)');
  await knex.schema.raw('CREATE INDEX idx_generation_jobs_project ON generation_jobs(project_id)');
  await knex.schema.raw('CREATE INDEX idx_generation_jobs_status ON generation_jobs(status)');
  await knex.schema.raw('CREATE INDEX idx_audit_logs_user ON audit_logs(user_id)');
  await knex.schema.raw('CREATE INDEX idx_audit_logs_action ON audit_logs(action)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('audit_logs');
  await knex.schema.dropTableIfExists('collaboration_sessions');
  await knex.schema.dropTableIfExists('generation_jobs');
  await knex.schema.dropTableIfExists('deployments');
  await knex.schema.dropTableIfExists('project_snapshots');
  await knex.schema.dropTableIfExists('project_files');
  await knex.schema.dropTableIfExists('projects');
  await knex.schema.dropTableIfExists('users');
}
