import { defineConfig } from "drizzle-kit";
import path from "path";
import { getSqlServerConnectionString } from "./src/sqlserver-env";

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "mssql",
  dbCredentials: {
    url: getSqlServerConnectionString(),
  },
});
