import { execSync } from "node:child_process";

export default function setup() {
  execSync("pnpm prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: "postgresql://campusign:campusign@localhost:54329/campusign_test" },
  });
}
