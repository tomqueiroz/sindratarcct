import { and, desc, eq } from "drizzle-orm";
import { DatabaseError, getDb } from "../_core/db";
import { todos } from "../db/schema";

export type Todo = {
  id: string;
  userId: string;
  title: string;
  done: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type TodoInput = {
  title: string;
};

export type TodoUpdateInput = {
  title?: string;
  done?: boolean;
};

function toTodo(row: typeof todos.$inferSelect): Todo {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    done: row.done,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export async function listTodos(userId: string) {
  const rows = await getDb()
    .select()
    .from(todos)
    .where(eq(todos.userId, userId))
    .orderBy(desc(todos.updatedAt), desc(todos.createdAt))
    .limit(100);

  return rows.map(toTodo);
}

export async function createTodo(userId: string, input: TodoInput) {
  const rows = await getDb()
    .insert(todos)
    .values({
      userId,
      title: input.title,
      done: false
    })
    .returning();

  return toTodo(rows[0]);
}

export async function updateTodo(userId: string, id: string, input: TodoUpdateInput) {
  const values: Partial<typeof todos.$inferInsert> = {
    updatedAt: new Date().toISOString()
  };

  if (input.title !== undefined) {
    values.title = input.title;
  }

  if (input.done !== undefined) {
    values.done = input.done;
  }

  if (input.title === undefined && input.done === undefined) {
    throw new DatabaseError("DATABASE_QUERY_FAILED", "At least one field is required", 400);
  }

  const rows = await getDb()
    .update(todos)
    .set(values)
    .where(and(eq(todos.id, id), eq(todos.userId, userId)))
    .returning();

  const row = rows[0];
  if (!row) {
    throw new DatabaseError("DATABASE_QUERY_FAILED", "Todo not found", 404);
  }

  return toTodo(row);
}

export async function deleteTodo(userId: string, id: string) {
  const rows = await getDb()
    .delete(todos)
    .where(and(eq(todos.id, id), eq(todos.userId, userId)))
    .returning({ id: todos.id });

  if (rows.length === 0) {
    throw new DatabaseError("DATABASE_QUERY_FAILED", "Todo not found", 404);
  }
}
