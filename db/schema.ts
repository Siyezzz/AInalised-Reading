import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const readerProfiles = sqliteTable('reader_profiles', {
  userId: text('user_id').primaryKey(),
  email: text('email').notNull(),
  goal: text('goal').notNull().default('读懂故事'),
  level: text('level').notNull().default('平时会读一些'),
  likes: text('likes').notNull().default('[]'),
  updatedAt: integer('updated_at').notNull(),
});

export const shelfBooks = sqliteTable(
  'shelf_books',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    title: text('title').notNull(),
    source: text('source').notNull(),
    sourceUrl: text('source_url'),
    fileKey: text('file_key'),
    contentType: text('content_type'),
    size: integer('size').notNull().default(0),
    progress: integer('progress').notNull().default(0),
    status: text('status').notNull().default('已导入'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_shelf_books_user_created').on(table.userId, table.createdAt),
  ],
);
