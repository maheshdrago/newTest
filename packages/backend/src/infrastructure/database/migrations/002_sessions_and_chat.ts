import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // User sessions — Redis-backed token allowlist for logout/invalidation
  await knex.schema.createTable('user_sessions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('token_hash', 64).notNullable().unique(); // SHA-256 of refresh token
    table.string('device_name', 255);
    table.string('ip_address', 45);
    table.string('user_agent', 512);
    table.timestamp('last_active_at').defaultTo(knex.fn.now());
    table.timestamp('expires_at').notNullable();
    table.boolean('is_revoked').defaultTo(false);
    table.timestamps(true, true);
  });

  // Chat messages — persisted conversation history per project
  await knex.schema.createTable('chat_messages', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('project_id').notNullable().references('id').inTable('projects').onDelete('CASCADE');
    table.uuid('user_id').references('id').inTable('users').onDelete('SET NULL');
    table.enum('role', ['user', 'assistant', 'system']).notNullable();
    table.text('content').notNullable();
    table.uuid('generation_job_id').references('id').inTable('generation_jobs').onDelete('SET NULL');
    table.jsonb('file_changes').defaultTo('[]'); // snapshot of files changed by this message
    table.jsonb('metadata').defaultTo('{}');     // tokens, model, cost, etc.
    table.timestamps(true, true);
  });

  // Indexes
  await knex.schema.raw('CREATE INDEX idx_user_sessions_user ON user_sessions(user_id)');
  await knex.schema.raw('CREATE INDEX idx_user_sessions_token ON user_sessions(token_hash)');
  await knex.schema.raw('CREATE INDEX idx_user_sessions_expires ON user_sessions(expires_at) WHERE is_revoked = false');
  await knex.schema.raw('CREATE INDEX idx_chat_messages_project ON chat_messages(project_id)');
  await knex.schema.raw('CREATE INDEX idx_chat_messages_created ON chat_messages(project_id, created_at)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('chat_messages');
  await knex.schema.dropTableIfExists('user_sessions');
}
