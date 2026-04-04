function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be set for SQL Server connectivity.`);
  }
  return value;
}

function optionalBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  return value === "1" || value === "true" || value === "yes";
}

export function getSqlServerConfig() {
  const server = required("SQLSERVER_HOST");
  const port = Number(process.env["SQLSERVER_PORT"]?.trim() || "1433");
  const database = required("SQLSERVER_DATABASE");
  const user = required("SQLSERVER_USER");
  const password = required("SQLSERVER_PASSWORD");
  const encrypt = optionalBoolean("SQLSERVER_ENCRYPT", true);
  const trustServerCertificate = optionalBoolean("SQLSERVER_TRUST_CERT", true);

  return {
    server,
    port,
    database,
    user,
    password,
    options: {
      encrypt,
      trustServerCertificate,
    },
  };
}

export function getSqlServerConnectionString() {
  const config = getSqlServerConfig();

  return [
    `Server=${config.server},${config.port}`,
    `Database=${config.database}`,
    `User Id=${config.user}`,
    `Password=${config.password}`,
    `Encrypt=${config.options.encrypt}`,
    `TrustServerCertificate=${config.options.trustServerCertificate}`,
  ].join(";");
}
