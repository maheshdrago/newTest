import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('notifications', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('type', 50).notNullable(); // deployment, generation, error, info
    table.string('title', 255).notNullable();
    table.text('message').notNullable();
    table.boolean('is_read').defaultTo(false);
    table.jsonb('metadata').defaultTo('{}');
    table.timestamps(true, true);
  });

  await knex.schema.raw('CREATE INDEX idx_notifications_user ON notifications(user_id)');
  await knex.schema.raw('CREATE INDEX idx_notifications_user_unread ON notifications(user_id) WHERE is_read = false');
  await knex.schema.raw('CREATE INDEX idx_notifications_created ON notifications(user_id, created_at DESC)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('notifications');
}
