import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

describe("PostgreSQL identifier safety after the dependency update", () => {
  it("keeps embedded quotes inside one quoted identifier", () => {
    const query = new PgDialect().sqlToQuery(sql`select ${sql.identifier('display"name')}`);
    expect(query.sql).toBe('select "display""name"');
    expect(query.params).toEqual([]);
  });

  it("keeps data values parameterized when identifiers contain quotes", () => {
    const value = "O'Reilly";
    const query = new PgDialect().sqlToQuery(sql`${sql.identifier('display"name')} = ${value}`);
    expect(query.sql).toBe('"display""name" = $1');
    expect(query.params).toEqual([value]);
  });
});
