import { drizzle } from "drizzle-orm/node-mssql";
import mssql from "mssql";
import * as schema from "./schema";
import { getSqlServerConfig } from "./sqlserver-env";

const sqlServerConfig = getSqlServerConfig();

export const pool = new mssql.ConnectionPool(sqlServerConfig);
export const poolConnect = pool.connect();
export const db = drizzle({ connection: sqlServerConfig, schema });

export * from "./schema";
